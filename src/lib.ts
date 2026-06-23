/* lyric-engine — 공유 가사 엔진 헬퍼 (lyrica / neu 공통)
 * cn · 타입 · YouTube id · 가나→한글 · 후리가나 분리 · 동기화 유틸 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export type LyricToken = { t: string; r?: string; m?: string }
export type LyricLine = {
  jp: LyricToken[]
  pron?: string
  mean?: string
  /* 줄 단위 동기화용 시작 시간(초) */
  t?: number
}

/* ---------------- YouTube id ---------------- */
export function getYouTubeId(input: string | undefined | null): string | null {
  if (!input) return null
  const s = input.trim()
  if (/^[\w-]{11}$/.test(s)) return s
  const patterns = [
    /[?&]v=([\w-]{11})/,
    /youtu\.be\/([\w-]{11})/,
    /\/embed\/([\w-]{11})/,
    /\/shorts\/([\w-]{11})/,
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m) return m[1]
  }
  return null
}

export function getEmbedUrl(input: string | undefined | null): string | null {
  const id = getYouTubeId(input)
  return id ? `https://www.youtube.com/embed/${id}` : null
}

/* ---------------- 가나 → 한국어 발음(근사) ---------------- */
function kataToHira(s: string): string {
  let out = ""
  for (const ch of s) {
    const code = ch.codePointAt(0)!
    if (code >= 0x30a1 && code <= 0x30f6) out += String.fromCodePoint(code - 0x60)
    else out += ch
  }
  return out
}

const YOON: Record<string, string> = {
  きゃ: "캬", きゅ: "큐", きょ: "쿄", ぎゃ: "갸", ぎゅ: "규", ぎょ: "교",
  しゃ: "샤", しゅ: "슈", しょ: "쇼", じゃ: "자", じゅ: "주", じょ: "조",
  ちゃ: "차", ちゅ: "추", ちょ: "초", ぢゃ: "자", ぢゅ: "주", ぢょ: "조",
  にゃ: "냐", にゅ: "뉴", にょ: "뇨",
  ひゃ: "햐", ひゅ: "휴", ひょ: "효",
  びゃ: "뱌", びゅ: "뷰", びょ: "뵤", ぴゃ: "퍄", ぴゅ: "퓨", ぴょ: "표",
  みゃ: "먀", みゅ: "뮤", みょ: "묘",
  りゃ: "랴", りゅ: "류", りょ: "료",
}

const KANA: Record<string, string> = {
  あ: "아", い: "이", う: "우", え: "에", お: "오",
  か: "카", き: "키", く: "쿠", け: "케", こ: "코",
  が: "가", ぎ: "기", ぐ: "구", げ: "게", ご: "고",
  さ: "사", し: "시", す: "스", せ: "세", そ: "소",
  ざ: "자", じ: "지", ず: "즈", ぜ: "제", ぞ: "조",
  た: "타", ち: "치", つ: "츠", て: "테", と: "토",
  だ: "다", ぢ: "지", づ: "즈", で: "데", ど: "도",
  な: "나", に: "니", ぬ: "누", ね: "네", の: "노",
  は: "하", ひ: "히", ふ: "후", へ: "헤", ほ: "호",
  ば: "바", び: "비", ぶ: "부", べ: "베", ぼ: "보",
  ぱ: "파", ぴ: "피", ぷ: "푸", ぺ: "페", ぽ: "포",
  ま: "마", み: "미", む: "무", め: "메", も: "모",
  や: "야", ゆ: "유", よ: "요",
  ら: "라", り: "리", る: "루", れ: "레", ろ: "로",
  わ: "와", を: "오",
  ぁ: "아", ぃ: "이", ぅ: "우", ぇ: "에", ぉ: "오", ゎ: "와",
  "、": ", ", "。": ". ", "・": " ",
}

const JONG_S = 19
const JONG_N = 4

function addJong(prev: string, jong: number): string | null {
  if (!prev) return null
  const code = prev.charCodeAt(prev.length - 1)
  if (code >= 0xac00 && code <= 0xd7a3 && (code - 0xac00) % 28 === 0) {
    return prev.slice(0, -1) + String.fromCharCode(code + jong)
  }
  return null
}

export function kanaToKo(input: string): string {
  if (!input) return input
  const s = kataToHira(input)
  let out = ""
  for (let i = 0; i < s.length; i++) {
    const two = s.slice(i, i + 2)
    if (YOON[two]) {
      out += YOON[two]
      i++
      continue
    }
    const ch = s[i]
    if (ch === "っ") {
      const r = addJong(out, JONG_S)
      if (r) out = r
      continue
    }
    if (ch === "ん") {
      const r = addJong(out, JONG_N)
      out = r ?? out + "ㄴ"
      continue
    }
    if (ch === "ー") continue
    out += KANA[ch] ?? ch
  }
  return out
}

/* ---------------- 후리가나 / 읽기 ---------------- */
export const KANA_ONLY = /^[぀-ゟ゠-ヿ]+$/
const PARTICLE_READING: Record<string, string> = { は: "わ", へ: "え" }
export const kanaReading = (s: string): string | undefined => {
  if (PARTICLE_READING[s]) return PARTICLE_READING[s]
  if (KANA_ONLY.test(s)) return s
  // 앞/끝의 문장부호(？！。「」 등)만 떼고 가나만 남으면 그 가나를 읽기로.
  // (예: "でしょう？" → "でしょう", "よっしゃ！" → "よっしゃ". 한자는 보존)
  const core = s.replace(
    /^[？！。、，．…‥「」『』（）()!?.,\s]+|[？！。、，．…‥「」『』（）()!?.,\s]+$/gu,
    "",
  )
  return core && KANA_ONLY.test(core) ? core : undefined
}
const HAS_KANJI = /[㐀-鿿]/
export const hasKanji = (s: string) => HAS_KANJI.test(s)
const isKanaCh = (c: string) => KANA_ONLY.test(c)

/** 한자에만 후리가나가 오도록 앞뒤 공통 가나(오쿠리가나)를 떼고 한자 중심부만 남김 */
export function splitFurigana(surface: string, reading: string) {
  let pre = 0
  while (
    pre < surface.length &&
    pre < reading.length &&
    surface[pre] === reading[pre] &&
    isKanaCh(surface[pre])
  )
    pre++
  let s = surface.length
  let r = reading.length
  while (
    s > pre &&
    r > pre &&
    surface[s - 1] === reading[r - 1] &&
    isKanaCh(surface[s - 1])
  ) {
    s--
    r--
  }
  return {
    before: surface.slice(0, pre),
    core: surface.slice(pre, s),
    rt: reading.slice(pre, r),
    after: surface.slice(s),
  }
}

/* ---------------- 동기화 ---------------- */
export const isVocal = (l: LyricLine) =>
  l.jp.length > 0 || !!l.pron || !!l.mean

export function activeIndexAt(
  lines: LyricLine[],
  now: number,
  _duration?: number,
): number {
  // 타임스탬프(t)가 있는 줄만 동기화. 없으면 -1 → 하이라이트 안 함(부정확한 균등분배 안 씀).
  let idx = -1
  for (let i = 0; i < lines.length; i++) {
    const t = lines[i].t
    if (typeof t === "number" && t <= now + 0.15) idx = i
  }
  return idx
}

/** timings(보컬 줄 순서 시작 시간)를 가사 줄에 주입 */
export function withTimings(lines: LyricLine[], tArr?: number[]): LyricLine[] {
  if (!tArr || !tArr.length) return lines
  let k = 0
  return lines.map((l) => {
    if (!isVocal(l)) return l
    const t = tArr[k++]
    return typeof t === "number" ? { ...l, t } : l
  })
}
