# 빌드 스펙 (구현 에이전트용) — 주식 스코어링/트레이딩 시스템

> 이 문서는 **구현 담당 에이전트가 보고 바로 코드를 짜는 명세서**다.
> 상위 설계는 `MASTER_PLAN_v3.md`, 단계/게이트는 `IMPLEMENTATION_PLAN.md` 참고.
> 이 문서는 "파일별 무엇을·어떤 시그니처로·어떤 입출력·무엇을 조심·무엇이 완료인지"만 정의한다.
> **함수 본문은 비워둔다. 구현은 담당 에이전트의 몫.**

---

## 0. 공통 규칙 (모든 파일 적용)

- **Python 3.11**, 타입힌트 필수, 모든 public 함수에 1~2줄 docstring(입출력 명시).
- **DataFrame 규약:** 가격은 `index=DatetimeIndex(거래일)`, `columns=티커`, 값=수정종가(adjusted close). 이 모양을 전 모듈이 공유한다.
- **시간 규약:** 모든 날짜는 tz-naive, 거래일 기준. "오늘까지 데이터"의 경계를 함수마다 명확히(룩어헤드 방지).
- **실패는 시끄럽게:** 데이터가 비거나 모양이 깨지면 조용히 빈 결과 말고 **명시적 경고/예외**.
- **순수 함수 우선:** `factors.py`, `scorer.py`는 네트워크/파일 IO 없이 DataFrame in → DataFrame out. (테스트 쉬움)
- **설정 주입:** 하드코딩 금지. 손잡이는 전부 `config.py`에서 받는다.
- **의존성:** `pandas`, `numpy`, `yfinance`, `lxml`, `alpaca-py`(Phase 3), `pytest`. 차트는 표준 `matplotlib`.
- 각 파일은 `if __name__ == "__main__":`에 **눈으로 확인용 미니 실행**(작은 유니버스로 출력 print)을 둔다.

---

## 1. `config.py` — 손잡이 한 곳

**목적:** 운영자 결정 항목을 한 파일에. 다른 모듈은 여기서만 값을 읽는다.

**형태:** `@dataclass(frozen=True) class Config:` 권장. 필드(기본값):

| 필드 | 타입 | 기본 | 의미 |
|---|---|---|---|
| `universe` | str | `"SP500"` | 유니버스 식별자 |
| `signal` | str | `"risk_adjusted_momentum"` | `"pure_momentum"`도 가능 |
| `momentum_lookback_months` | int | 12 | 모멘텀 측정 기간 |
| `momentum_skip_months` | int | 1 | 최근 제외(12-1의 -1) |
| `vol_window_days` | int | 63 | 변동성 윈도(≈3개월) |
| `sector_neutral` | bool | True | 섹터 중립 z-score |
| `min_stocks_per_sector` | int | 5 | 섹터 가드 |
| `top_n` | int | 20 | 보유 종목 수 |
| `weighting` | str | `"inverse_vol"` | 비중 방식 |
| `trend_gate` | bool | False | 200일 MA 게이트(기본 OFF, 가설) |
| `trend_ma_days` | int | 200 | 추세 게이트 윈도 |
| `rebalance` | str | `"M"` | 월 1회 |
| `slippage_bps` | float | 7.5 | 편당 슬리피지(5~10bp 중간) |
| `commission_bps` | float | 0.0 | 수수료 |
| `oos_split_date` | str | `"2021-01-01"` | 개발/검증 분할 경계 |
| `cache_dir` | str | `"data/cache"` | |

- `Config.load()` 클래스메서드로 `.env`/환경변수 오버라이드 허용(키 같은 민감값만).
- **합격선 상수**(`PASS_EXCESS_CAGR=0.03`(0.03~0.05 범위, 운영자 확정), `PASS_MAX_MDD=-0.35`)도 여기 명시 — 백테스트 전에 박아둔다. 생존편향으로 초과수익이 부풀려질 수 있어 보수적으로 높게 잡는다.

**완료기준:** `from config import Config; Config()` 가 기본값으로 생성되고 출력됨.

---

## 2. `data/adapter.py` — 데이터 어댑터

**목적:** 가격·유니버스·섹터를 깨끗하게 가져오는 단일 창구. 캐싱·검증 포함.
**IO 허용 유일 모듈 중 하나**(여기서 네트워크·파일).

### 함수 시그니처

```python
def get_universe(source: str = "SP500") -> pd.DataFrame:
    """위키 S&P500 표 → columns=['ticker','sector']. GICS Sector 컬럼 사용."""

def get_prices(tickers: list[str], start: str, end: str,
               cache_dir: str = "data/cache", use_cache: bool = True) -> pd.DataFrame:
    """yfinance 수정종가 일별. index=날짜, columns=티커. 캐시 우선."""

def validate_prices(prices: pd.DataFrame,
                    requested: list[str]) -> dict:
    """데이터 품질 리포트(dict) 반환. 예외 안 던지고 플래그만."""
```

### 핵심 로직/주의

- `get_universe`: `pd.read_html(위키 URL)`로 표 파싱. 티커의 `.`→`-` 정규화(yfinance 호환, 예: `BRK.B`→`BRK-B`). 섹터 컬럼명은 위키 변경 가능성 있으니 "Sector" 포함 컬럼 탐색.
- `get_prices`:
  - **수정종가**(`auto_adjust=True` 또는 `Adj Close`) — 배당·분할 반영. 이게 틀리면 모멘텀 전체가 거짓.
  - **캐싱:** `cache_dir`에 `{start}_{end}.parquet` 등으로 저장. 있으면 재다운로드 skip. 부분 갱신은 1차 범위 밖(MVP는 통캐시).
  - 다운로드 실패 티커는 제외하되 **몇 개 빠졌는지 로그**.
- `validate_prices` 리포트 키(최소): `n_requested`, `n_received`, `coverage_ratio`, `nan_ratio_per_ticker`(상위 몇 개), `nonpositive_prices`, `extreme_moves`(하루 |수익률|>50% 플래그), `sectors_below_min`. → 호출부가 이걸 print하고 임계 넘으면 경고.

### 완료기준 / 테스트(`tests/test_adapter.py`)
- 유니버스가 ~500행, `sector` 결측 없음.
- 캐시 미스→파일 생성, 캐시 히트→네트워크 호출 안 함(모킹).
- 일부러 NaN/0/급등 끼운 더미 → `validate_prices`가 잡아냄.

---

## 3. `factors.py` — 팩터 계산 (순수 함수)

**목적:** 가격 DF → 팩터값. **변동성은 여기서 점수용으로 단 한 번.**

```python
def momentum(prices: pd.DataFrame, lookback_m: int = 12, skip_m: int = 1,
            asof: pd.Timestamp | None = None) -> pd.Series:
    """12-1 모멘텀: (skip개월 전 가격 / lookback개월 전 가격) - 1. index=티커."""

def volatility(prices: pd.DataFrame, window_d: int = 63,
              asof: pd.Timestamp | None = None) -> pd.Series:
    """일별 수익률 표준편차 × sqrt(252) (연율화). index=티커."""

def risk_adjusted_momentum(prices: pd.DataFrame, cfg) -> pd.Series:
    """momentum / volatility. 점수용 핵심 신호."""

def above_ma(prices: pd.DataFrame, ma_days: int = 200,
            asof: pd.Timestamp | None = None) -> pd.Series:
    """현재가 > ma_days 이동평균 여부(bool). 추세 게이트용."""
```

### 핵심 로직/주의 (룩어헤드의 핵심 지점)

- `asof`가 주어지면 **그 날짜까지의 데이터만** 사용. 백테스트가 과거 시점을 재현할 때 미래 누수 차단의 1차 방어선.
- **12-1 인덱싱:** "최근 1개월 제외, 그 직전 12개월"이 헷갈리기 쉬움. 거래일 근사(예: skip=21일, lookback=252일)인지 캘린더 월 기준인지 **한 가지로 통일**하고 docstring에 명시. 권장: 월말 리샘플 후 월 인덱스로 `shift` 사용(명확함).
- 0 변동성/결측 종목은 NaN 반환(스코어러가 거르도록). 0으로 나누지 말 것.

### 완료기준 / 테스트(`tests/test_factors.py`)
- 합성 가격(일정 추세 + 변동성)으로 부호·크기 검증.
- 단조 상승 종목이 모멘텀 상위, 진동 종목이 변동성 상위.
- `asof` 다르게 주면 다른 값(미래 데이터 안 새는지 경계 테스트).

---

## 4. `scorer.py` — 섹터중립 z-score + 비중 (순수 함수)

**목적:** 팩터 → 점수 → 상위 N → 비중. **변동성 두 번째 역할(역변동성 비중)은 여기.**

```python
def sector_zscore(values: pd.Series, sectors: pd.Series,
                 min_per_sector: int = 5) -> pd.Series:
    """섹터 안에서 (x - 섹터평균)/섹터표준편차. 종목수<min인 섹터는 NaN 처리."""

def combined_score(factor_z: dict[str, pd.Series],
                  weights: dict[str, float]) -> pd.Series:
    """Σ(wᵢ × zᵢ). 키는 팩터명. NaN 있는 종목은 결과 NaN."""

def inverse_vol_weights(selected: pd.Index, vol: pd.Series) -> pd.Series:
    """1/vol 정규화(합=1). 리스크 관리용(점수 아님)."""

def rank_and_select(scores: pd.Series, top_n: int,
                   trend_ok: pd.Series | None = None) -> pd.Index:
    """점수 내림차순 상위 top_n. trend_ok 주어지면 False 종목 먼저 제외."""

def build_portfolio(prices, sectors, cfg) -> pd.DataFrame:
    """오케스트레이션: 팩터→z→score→select→weight. columns=['score','weight','sector']."""
```

### 핵심 로직/주의
- `sector_zscore`: 섹터 표준편차 0(종목 1개 등)이면 NaN. min 가드와 함께 처리.
- `combined_score`: 신호가 1개면 가중 1.0(동일가중 기본). v3는 모멘텀 계열을 **쌓지 않는다** — 위험조정 모멘텀 *또는* 순수 모멘텀 중 하나.
- `build_portfolio`는 `config.signal`/`trend_gate`/`weighting`을 읽어 분기. **여기가 백테스트·실행기 공용 진입점**이라 한 번만 잘 만들면 재사용.
- 출력 DF를 CSV로 저장하는 헬퍼 1개(`save_portfolio(df, path)`).

### 완료기준 / 테스트(`tests/test_scorer.py`)
- z-score: 섹터별 평균≈0.
- 비중 합=1, 모든 비중>0.
- 추세 게이트 ON 시 MA 아래 종목 미선정.
- 특정 날짜 결과가 **납득 가능**(샘플 출력 육안 확인).

---

## 5. `backtest.py` — 정직한 백테스트 ★생명선★

**목적:** 비용·룩어헤드·OOS 반영. 게이트 ON/OFF 비교. **여기서 막히면 전체 중단.**

```python
def run_backtest(prices, sectors, cfg,
                start: str, end: str) -> BacktestResult:
    """월말 리밸 시뮬. 신호=리밸일까지, 체결=다음 거래일 시가, 비용 차감."""

def compute_metrics(equity_curve: pd.Series,
                   benchmark: pd.Series, turnover: pd.Series) -> dict:
    """CAGR, vol, Sharpe, MDD, SPY대비 초과CAGR, 평균 회전율."""

def compare_versions(prices, sectors, base_cfg,
                    variants: list[dict]) -> pd.DataFrame:
    """2~3개 버전(게이트 ON/OFF, top_n 15 vs 20)만 비교. 행=버전, 열=지표."""

def oos_check(prices, sectors, cfg, split_date: str) -> dict:
    """개발기간 1등 버전을 '안 본 기간'에서 재검증. in/out 지표 dict."""
```

`BacktestResult`(dataclass): `equity_curve`, `weights_history`, `trades`, `turnover`, `metrics`.

### 핵심 로직/주의 (가장 조심할 모듈)
- **룩어헤드 차단(1순위):**
  - 리밸일 `t`의 신호는 `factors(..., asof=t)` — t까지 데이터만.
  - 체결가는 `t+1`의 **시가**(`Open`). 종가로 신호 만들고 종가로 체결 = 누수.
  - → 어댑터에서 시가도 받아와야 함(`get_prices`에 OHLC 옵션 또는 별도 시가 DF).
- **비용:** 매 리밸 회전율 × (`slippage_bps + commission_bps`) / 10000 을 수익에서 차감. 회전율 = Σ|새비중-옛비중|/2.
- **생존편향 한계:** `BacktestResult.metrics`에 `survivorship_warning: True` + 리포트 텍스트 항상 포함. 텍스트엔 "현재 구성종목 사용 → SPY 대비 초과수익도 부풀려질 수 있음, 백테스트 통과 = 실거래 자격이 아니라 페이퍼로 넘어갈 최소 허들"을 명시.
- **OOS 소모 규칙:** OOS 결과를 본 뒤 전략을 수정하면 그 OOS는 소모된 것으로 간주(새 검증 기간 없이 재합격 판정 금지). 코드보다 운영 규율이라 `run_backtest` 상단 주석 + 리포트에 한 줄 박는다.
- **재현성:** 같은 입력 → 같은 출력(난수 없음). 있으면 시드 고정.
- **과최적화 가드:** `compare_versions`는 **2~3개로 제한**. 파라미터 그리드서치 만들지 말 것.
- **합격 판정 헬퍼:** `passes_gate(metrics, oos_metrics, cfg) -> bool` — config의 합격선 상수로만 판정. 통과해도 반환값은 "페이퍼 진행 자격"이지 "실거래 자격"이 아님.
- 자산곡선/벤치마크 그래프 저장(`matplotlib`, `logs/`에 png).

### 완료기준 / 테스트(`tests/test_backtest.py`)
- **비용 민감도:** slippage=0 → 수익↑, slippage↑ → 수익↓ (비용 로직 검증).
- **룩어헤드 역검증:** 일부러 체결을 같은 날 종가로 바꾸면 성과가 비현실적으로↑ (차단 로직이 진짜 막는지).
- 회전율 0(매월 동일 포트) → 비용 0.
- `compute_metrics`를 알려진 수열로 검증(CAGR/MDD 수식 확인).

---

## 6. Phase 3 이후 (스펙은 간략, Phase 2 통과 후 상세화)

> **Phase 2 게이트를 통과하기 전엔 손대지 않는다.** 시그니처만 예약.

- **`executor.py`** — `class AlpacaExecutor`: `get_account()`, `rebalance(target_weights: pd.Series)`, 부분체결/실패 처리. 페이퍼 전용. 키는 `.env`.
- **`logger.py`** — `log_rebalance(date, scores, fills, balance)` → CSV/SQLite. 백테스트 대조용 스키마 고정.
- **`run_daily.py`** — 진입점: 오늘 리밸일? → `build_portfolio` → `executor.rebalance` → `logger`. cron/VPS.
- **킬스위치(Phase 4 전 필수)** — 일/누적 손실 한도 초과 시 전량 청산 + 주문 중단. **거래 코드보다 먼저** 구현·검증.

---

## 7. 구현 순서 (담당 에이전트용)

```
config.py
  → data/adapter.py  (+ test)
  → factors.py       (+ test)
  → scorer.py        (+ test)
  → backtest.py      (+ test)  ★여기 게이트★
  → (통과 후) executor / logger / run_daily / 킬스위치
```

**규칙:** 한 파일 = 테스트 통과 + `__main__` 미니 실행 출력 육안 확인 후 다음으로. 한 번에 한 파일.
**금지:** Phase 2 통과 전 펀더멘털 팩터 추가, 파라미터 미세조정, 실거래 코드.
```
