import {
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react"
import { createPortal } from "react-dom"

import {
  cn,
  kanaToKo,
  kanaReading,
  hasKanji,
  splitFurigana,
  isVocal,
  activeIndexAt,
  withTimings,
  type LyricToken,
  type LyricLine,
} from "./lib"
import { useYouTube, type YTPlayer } from "./use-youtube"

type Tip = {
  r?: string
  m?: string
  left: number
  top: number
  below: boolean
} | null

export type LyricLabels = {
  furigana: string
  pron: string
  mean: string
  full: string
  line: string
  guide: string
  syncPlaceholder: string
  empty: string
}

const DEFAULT_LABELS: LyricLabels = {
  furigana: "후리가나",
  pron: "한국어 발음",
  mean: "한국어 뜻",
  full: "전체 보기",
  line: "줄 단위",
  guide:
    "단어에 마우스를 올리거나(모바일은 탭) 누르면 읽는 법과 뜻이 나타납니다. 발음·뜻은 위 버튼으로 켜고 끌 수 있어요.",
  syncPlaceholder: "▶ 영상을 재생하면 현재 부르는 줄이 표시됩니다",
  empty: "가사 데이터가 없습니다.",
}

export type LyricPlayerProps = {
  /** 가사 줄(보컬 + 빈 줄) */
  lines: LyricLine[]
  /** 보컬 줄 순서 시작 시간(초). 있으면 줄 단위 동기화가 정확해짐 */
  timings?: number[]
  /** YouTube 영상 id (동기화용 Player API). 없으면 fallback */
  videoId: string | null
  /** 영상 없을 때 자리표시 */
  videoFallback?: ReactNode
  /** 독자 UI 언어. "ko" 면 가나 읽기를 한국어 발음으로 변환 */
  lang: string
  /** 교습 모드(일본어 가사 + 후리가나/발음) */
  teaching: boolean
  /** 가사 원어(버전 id). 비교습 모드에서 발음 표기 조건 */
  lyricLang: string
  /** 영상과 토글 사이에 들어갈 곡 정보(제목/아티스트 등) */
  meta?: ReactNode
  labels?: Partial<LyricLabels>
}

function LayerToggle({
  on,
  onClick,
  children,
}: {
  on: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-sm transition-colors",
        on
          ? "border-primary/40 bg-accent text-accent-foreground"
          : "border-border text-muted-foreground line-through opacity-60",
      )}
    >
      {children}
    </button>
  )
}

function fmt(s: number) {
  if (!Number.isFinite(s) || s < 0) s = 0
  const m = Math.floor(s / 60)
  const ss = Math.floor(s % 60)
    .toString()
    .padStart(2, "0")
  return `${m}:${ss}`
}

/** 전체보기에서 가사 카드 최상단에 sticky 로 붙는 미니 재생바 (유튜브와 연동) */
function PlaybackBar({
  playerRef,
  onScrub,
  onJump,
}: {
  playerRef: { current: YTPlayer | null }
  onScrub?: (sec: number) => void
  onJump?: () => void
}) {
  const [cur, setCur] = useState(0)
  const [dur, setDur] = useState(0)
  const [playing, setPlaying] = useState(false)
  const seekingRef = useRef(false)
  const valRef = useRef(0)

  useEffect(() => {
    const id = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      if (!seekingRef.current) setCur(p.getCurrentTime?.() ?? 0)
      setDur(p.getDuration?.() ?? 0)
      setPlaying((p.getPlayerState?.() ?? -1) === 1)
    }, 250)
    return () => window.clearInterval(id)
  }, [playerRef])

  const toggle = () => {
    const p = playerRef.current
    if (!p) return
    if (playing) p.pauseVideo?.()
    else p.playVideo?.()
  }
  const onSeek = (v: number) => {
    valRef.current = v
    setCur(v)
    playerRef.current?.seekTo?.(v, true)
  }
  // 사용자가 직접 바를 놓는 순간에만 가사 스크롤 (유튜브 재생/조작 땐 호출 안 됨)
  const commitScrub = () => {
    seekingRef.current = false
    onScrub?.(valRef.current)
  }

  return (
    <div className="sticky top-14 z-10 -mx-6 -mt-6 mb-4 flex items-center gap-3 rounded-t-xl border-b border-border bg-card/95 px-6 py-2.5 backdrop-blur sm:-mx-8 sm:-mt-8 sm:px-8 lg:top-3">
      <button
        type="button"
        onClick={toggle}
        aria-label={playing ? "일시정지" : "재생"}
        className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground transition-colors hover:bg-primary/90"
      >
        {playing ? (
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
            <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" className="size-4" fill="currentColor">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
      </button>
      <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
        {fmt(cur)}
      </span>
      <input
        type="range"
        min={0}
        max={dur || 0}
        step={0.1}
        value={Math.min(cur, dur || 0)}
        onPointerDown={() => (seekingRef.current = true)}
        onPointerUp={commitScrub}
        onKeyUp={commitScrub}
        onChange={(e) => onSeek(Number(e.target.value))}
        aria-label="재생 위치"
        className="h-1.5 flex-1 cursor-pointer accent-primary"
      />
      <span className="w-9 shrink-0 text-xs tabular-nums text-muted-foreground">
        {fmt(dur)}
      </span>
      {onJump && (
        <button
          type="button"
          onClick={onJump}
          aria-label="현재 가사로 이동"
          title="현재 가사로 이동"
          className="inline-flex size-8 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
        >
          <svg
            viewBox="0 0 24 24"
            className="size-4"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
          >
            <circle cx="12" cy="12" r="7" />
            <path d="M12 2v3M12 19v3M2 12h3M19 12h3" />
            <circle cx="12" cy="12" r="1.6" fill="currentColor" stroke="none" />
          </svg>
        </button>
      )}
    </div>
  )
}

function Word({
  tok,
  reading,
  surface,
  onShow,
  onHide,
}: {
  tok: LyricToken
  reading?: string
  surface?: ReactNode
  onShow: (el: HTMLElement, r?: string, m?: string) => void
  onHide: () => void
}) {
  const content = surface ?? tok.t
  if (!reading && !tok.m) return <span>{content}</span>
  const aria =
    tok.t + (reading ? ` (${reading})` : "") + (tok.m ? ` — ${tok.m}` : "")
  return (
    <span
      role="button"
      tabIndex={0}
      aria-label={aria}
      className="mx-px cursor-help rounded-sm border-b-2 border-dotted border-primary/40 transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:outline-none"
      onMouseEnter={(e) => onShow(e.currentTarget, reading, tok.m)}
      onMouseLeave={onHide}
      onFocus={(e) => onShow(e.currentTarget, reading, tok.m)}
      onBlur={onHide}
      onClick={(e) => {
        e.stopPropagation()
        onShow(e.currentTarget, reading, tok.m)
      }}
    >
      {content}
    </span>
  )
}

/** 공유 가사 플레이어: 영상 + 후리가나/발음 정렬 가사 + 전체/줄단위 모드 + 동기화 */
export function LyricPlayer({
  lines: rawLines,
  timings,
  videoId,
  videoFallback,
  lang,
  teaching,
  lyricLang,
  meta,
  labels,
}: LyricPlayerProps) {
  const L = { ...DEFAULT_LABELS, ...labels }

  const [showFurigana, setShowFurigana] = useState(true)
  const [showPron, setShowPron] = useState(true)
  const [showMean, setShowMean] = useState(true)
  const [tip, setTip] = useState<Tip>(null)
  const [mode, setMode] = useState<"full" | "sync">("full")
  const [activeLine, setActiveLine] = useState(-1)
  const sync = mode === "sync"

  const lines = withTimings(rawLines, timings)
  const { hostRef, playerRef, ready } = useYouTube(videoId)
  const lyricsBoxRef = useRef<HTMLDivElement>(null)

  // 커스텀 재생바를 직접 조작했을 때만 해당 가사 줄로 스크롤 (유튜브 조작 시엔 호출 안 함)
  const scrollToTime = (sec: number) => {
    const dur = playerRef.current?.getDuration?.() ?? 0
    const idx = activeIndexAt(lines, sec, dur)
    if (idx < 0) return
    const el = lyricsBoxRef.current?.querySelector(`[data-line="${idx}"]`)
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
  }

  // 점프 버튼: 현재 재생 중인(하이라이트) 줄로 이동
  const scrollToActiveLine = () => {
    if (activeLine < 0) return
    const el = lyricsBoxRef.current?.querySelector(`[data-line="${activeLine}"]`)
    el?.scrollIntoView({ block: "center", behavior: "smooth" })
  }

  const showReading = (r?: string) => (r && lang === "ko" ? kanaToKo(r) : r)

  // 곡/모드 바뀌면 현재 줄 초기화
  useEffect(() => {
    setActiveLine(-1)
  }, [videoId, mode])

  // 재생 시간 폴링 → 현재 줄
  useEffect(() => {
    if (!ready) return
    const id = window.setInterval(() => {
      const p = playerRef.current
      if (!p) return
      const now = p.getCurrentTime?.() ?? 0
      const dur = p.getDuration?.() ?? 0
      const idx = activeIndexAt(lines, now, dur)
      setActiveLine((prev) => (prev === idx ? prev : idx))
    }, 250)
    return () => window.clearInterval(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, rawLines])

  function seekToLine(i: number) {
    const p = playerRef.current
    if (!p?.seekTo) return
    const line = lines[i]
    if (typeof line?.t === "number") return p.seekTo(line.t, true)
    const dur = p.getDuration?.() ?? 0
    if (!dur) return
    const vocal = lines.map((l, idx) => ({ l, idx })).filter((x) => isVocal(x.l))
    const k = vocal.findIndex((x) => x.idx === i)
    if (k >= 0) p.seekTo((k / vocal.length) * dur, true)
  }

  // 줄단위 모드: 이전/다음 보컬 줄로 이동 (영상이 있으면 그 줄로 seek)
  function gotoLine(dir: -1 | 1) {
    const vocal = lines
      .map((l, idx) => ({ l, idx }))
      .filter((x) => isVocal(x.l))
      .map((x) => x.idx)
    if (!vocal.length) return
    const pos = vocal.indexOf(activeLine)
    const nextPos =
      pos < 0 ? 0 : Math.min(Math.max(pos + dir, 0), vocal.length - 1)
    const target = vocal[nextPos]
    setActiveLine(target)
    seekToLine(target)
  }

  function showTip(el: HTMLElement, r?: string, m?: string) {
    if (!r && !m) return
    const rect = el.getBoundingClientRect()
    const below = rect.top < 90
    setTip({
      r,
      m,
      left: rect.left + rect.width / 2,
      top: below ? rect.bottom + 10 : rect.top - 10,
      below,
    })
  }
  const hideTip = () => setTip(null)

  useEffect(() => {
    if (!tip) return
    const close = () => hideTip()
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") hideTip()
    }
    window.addEventListener("scroll", close, { passive: true })
    window.addEventListener("resize", close)
    document.addEventListener("click", close)
    document.addEventListener("keydown", onKey)
    return () => {
      window.removeEventListener("scroll", close)
      window.removeEventListener("resize", close)
      document.removeEventListener("click", close)
      document.removeEventListener("keydown", onKey)
    }
  }, [tip])

  const renderLine = (
    line: LyricLine,
    i: number,
    opts: { current: boolean; big: boolean },
  ) => {
    const isSpacer = line.jp.length === 0 && !line.pron && !line.mean
    if (isSpacer) return <div key={i} aria-hidden className="h-3" />
    const { current, big } = opts
    if (teaching) {
      return (
        <div
          key={i}
          data-line={i}
          onClick={() => seekToLine(i)}
          className={cn(
            "cursor-pointer rounded-r-md border-l-2 border-accent pl-4 transition-all",
            current && "bg-accent",
            big && "border-l-0 pl-0",
          )}
        >
          <div
            className={cn(
              "flex flex-wrap items-end font-display leading-snug",
              big ? "justify-center gap-x-1.5 gap-y-4" : "gap-x-1 gap-y-3",
            )}
          >
            {line.jp.map((tok, j) => {
              const reading = showReading(tok.r ?? kanaReading(tok.t))
              let surface: ReactNode = tok.t
              if (showFurigana) {
                const seg =
                  tok.r && hasKanji(tok.t) ? splitFurigana(tok.t, tok.r) : null
                surface =
                  seg && seg.core ? (
                    <>
                      {seg.before}
                      <ruby>
                        {seg.core}
                        <rt>{seg.rt}</rt>
                      </ruby>
                      {seg.after}
                    </>
                  ) : (
                    <ruby>
                      {tok.t}
                      <rt>{" "}</rt>
                    </ruby>
                  )
              }
              return (
                <span key={j} className="inline-flex flex-col items-center">
                  <span
                    className={cn(
                      "lyric-ruby",
                      big ? "text-2xl sm:text-3xl" : "text-xl sm:text-2xl",
                    )}
                  >
                    <Word
                      tok={tok}
                      reading={reading}
                      surface={surface}
                      onShow={showTip}
                      onHide={hideTip}
                    />
                  </span>
                  {showPron && (
                    <span
                      className={cn(
                        "text-accent-2 leading-none",
                        big ? "text-sm" : "text-[0.7rem]",
                      )}
                    >
                      {reading ?? " "}
                    </span>
                  )}
                </span>
              )
            })}
          </div>
          {showMean && line.mean && (
            <p
              className={cn(
                "mt-2 text-muted-foreground",
                big ? "text-center text-base" : "text-sm",
              )}
            >
              {line.mean}
            </p>
          )}
        </div>
      )
    }

    return (
      <div
        key={i}
        data-line={i}
        onClick={() => seekToLine(i)}
        className={cn(
          "cursor-pointer rounded-md px-2 transition-all",
          current && "bg-accent",
          big && "text-center",
        )}
      >
        <p
          className={cn(
            "font-display leading-relaxed",
            big ? "text-2xl sm:text-3xl" : "text-lg sm:text-xl",
          )}
        >
          {line.jp.map((tok) => tok.t).join("")}
        </p>
        {lyricLang === "ko" && showPron && line.pron && (
          <p className={cn("text-accent-2", big ? "text-base" : "text-sm")}>
            {line.pron}
          </p>
        )}
      </div>
    )
  }

  return (
    <div>
      {/* 영상 (Player API) */}
      <div className="mb-6">
        {videoId ? (
          <div className="aspect-video overflow-hidden rounded-xl border border-border shadow-md [&_iframe]:size-full">
            <div ref={hostRef} className="size-full" />
          </div>
        ) : (
          videoFallback ?? (
            <div className="flex aspect-video items-center justify-center rounded-xl border border-dashed border-border bg-card/50 text-sm text-muted-foreground">
              영상 준비 중
            </div>
          )
        )}
      </div>

      {meta && <div className="mb-6">{meta}</div>}

      {/* 보기 모드 */}
      <div className="mb-4">
        <div className="inline-flex rounded-full border border-border p-0.5 text-sm">
          <button
            type="button"
            aria-pressed={!sync}
            onClick={() => setMode("full")}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              !sync
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {L.full}
          </button>
          <button
            type="button"
            aria-pressed={sync}
            onClick={() => setMode("sync")}
            className={cn(
              "rounded-full px-3 py-1 transition-colors",
              sync
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {L.line}
          </button>
        </div>
      </div>

      {!sync && L.guide && (
        <p className="mb-5 text-xs leading-relaxed text-muted-foreground/80">
          {L.guide}
        </p>
      )}

      {/* 가사 (하얀 카드) */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {/* 전체보기 + 영상 있을 때: sticky 미니 재생바 (스크롤해도 상단 고정) */}
        {!sync && videoId && lines.length > 0 && (
          <PlaybackBar
            playerRef={playerRef}
            onScrub={scrollToTime}
            onJump={scrollToActiveLine}
          />
        )}
        {/* 레이어 토글 — 카드 우측 상단 */}
        {lines.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center justify-end gap-2">
            <LayerToggle on={showFurigana} onClick={() => setShowFurigana((v) => !v)}>
              {L.furigana}
            </LayerToggle>
            <LayerToggle on={showPron} onClick={() => setShowPron((v) => !v)}>
              {L.pron}
            </LayerToggle>
            <LayerToggle on={showMean} onClick={() => setShowMean((v) => !v)}>
              {L.mean}
            </LayerToggle>
          </div>
        )}
        {!lines.length ? (
          <p className="text-muted-foreground">{L.empty}</p>
        ) : sync ? (
          <div className="flex min-h-[180px] items-center gap-1 sm:gap-3">
            <button
              type="button"
              onClick={() => gotoLine(-1)}
              aria-label="이전 줄"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <div className="flex min-w-0 flex-1 flex-col justify-center">
              {activeLine >= 0 && lines[activeLine] ? (
                renderLine(lines[activeLine], activeLine, {
                  current: true,
                  big: true,
                })
              ) : (
                <p className="py-6 text-center text-muted-foreground">
                  {L.syncPlaceholder}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={() => gotoLine(1)}
              aria-label="다음 줄"
              className="inline-flex size-9 shrink-0 items-center justify-center rounded-full border border-border text-muted-foreground transition-colors hover:border-primary/50 hover:text-primary"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </div>
        ) : (
          <div
            ref={lyricsBoxRef}
            className={cn("flex flex-col", teaching ? "gap-6" : "gap-2")}
          >
            {lines.map((line, i) =>
              renderLine(line, i, { current: i === activeLine, big: false }),
            )}
          </div>
        )}
      </div>

      {tip &&
        createPortal(
          <div
            role="tooltip"
            className={cn("ly-tip", tip.below && "is-below")}
            style={{
              left: tip.left,
              top: tip.top,
              transform: tip.below
                ? "translate(-50%, 0)"
                : "translate(-50%, -100%)",
            }}
          >
            {tip.r && <span className="ly-tip-r">{tip.r}</span>}
            {tip.m && <span className="ly-tip-m">{tip.m}</span>}
          </div>,
          document.body,
        )}
    </div>
  )
}
