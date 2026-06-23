import {
  useEffect,
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
import { useYouTube } from "./use-youtube"

type Tip = {
  r?: string
  m?: string
  left: number
  top: number
  below: boolean
} | null

export type LyricLabels = {
  jp: string
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
  jp: "일본어 가사",
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

      {/* 레이어 토글 */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <span className="rounded-md bg-accent px-2.5 py-1 text-xs text-accent-foreground">
          {L.jp}
        </span>
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

      {!sync && L.guide && (
        <p className="mb-5 text-xs leading-relaxed text-muted-foreground/80">
          {L.guide}
        </p>
      )}

      {/* 가사 */}
      <div className="rounded-xl border border-border bg-card p-6 shadow-sm sm:p-8">
        {!lines.length ? (
          <p className="text-muted-foreground">{L.empty}</p>
        ) : sync ? (
          <div className="flex min-h-[180px] flex-col justify-center">
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
        ) : (
          <div className={cn("flex flex-col", teaching ? "gap-6" : "gap-2")}>
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
