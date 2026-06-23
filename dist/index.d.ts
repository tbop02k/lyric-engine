import * as react from 'react';
import { ReactNode } from 'react';
import { ClassValue } from 'clsx';

declare function cn(...inputs: ClassValue[]): string;
type LyricToken = {
    t: string;
    r?: string;
    m?: string;
};
type LyricLine = {
    jp: LyricToken[];
    pron?: string;
    mean?: string;
    t?: number;
};
declare function getYouTubeId(input: string | undefined | null): string | null;
declare function getEmbedUrl(input: string | undefined | null): string | null;
declare function kanaToKo(input: string): string;
declare const KANA_ONLY: RegExp;
declare const kanaReading: (s: string) => string | undefined;
declare const hasKanji: (s: string) => boolean;
/** 한자에만 후리가나가 오도록 앞뒤 공통 가나(오쿠리가나)를 떼고 한자 중심부만 남김 */
declare function splitFurigana(surface: string, reading: string): {
    before: string;
    core: string;
    rt: string;
    after: string;
};
declare const isVocal: (l: LyricLine) => boolean;
declare function activeIndexAt(lines: LyricLine[], now: number, _duration?: number): number;
/** timings(보컬 줄 순서 시작 시간)를 가사 줄에 주입 */
declare function withTimings(lines: LyricLine[], tArr?: number[]): LyricLine[];

type LyricLabels = {
    furigana: string;
    pron: string;
    mean: string;
    full: string;
    line: string;
    guide: string;
    syncPlaceholder: string;
    empty: string;
};
type LyricPlayerProps = {
    /** 가사 줄(보컬 + 빈 줄) */
    lines: LyricLine[];
    /** 보컬 줄 순서 시작 시간(초). 있으면 줄 단위 동기화가 정확해짐 */
    timings?: number[];
    /** YouTube 영상 id (동기화용 Player API). 없으면 fallback */
    videoId: string | null;
    /** 영상 없을 때 자리표시 */
    videoFallback?: ReactNode;
    /** 독자 UI 언어. "ko" 면 가나 읽기를 한국어 발음으로 변환 */
    lang: string;
    /** 교습 모드(일본어 가사 + 후리가나/발음) */
    teaching: boolean;
    /** 가사 원어(버전 id). 비교습 모드에서 발음 표기 조건 */
    lyricLang: string;
    /** 영상과 토글 사이에 들어갈 곡 정보(제목/아티스트 등) */
    meta?: ReactNode;
    labels?: Partial<LyricLabels>;
};
/** 공유 가사 플레이어: 영상 + 후리가나/발음 정렬 가사 + 전체/줄단위 모드 + 동기화 */
declare function LyricPlayer({ lines: rawLines, timings, videoId, videoFallback, lang, teaching, lyricLang, meta, labels, }: LyricPlayerProps): react.JSX.Element;

type YTPlayer = {
    getCurrentTime: () => number;
    getDuration: () => number;
    getPlayerState: () => number;
    seekTo: (seconds: number, allowSeekAhead: boolean) => void;
    playVideo: () => void;
    pauseVideo: () => void;
    destroy: () => void;
};
declare global {
    interface Window {
        YT?: {
            Player: new (el: Element, opts: unknown) => YTPlayer;
        };
        onYouTubeIframeAPIReady?: () => void;
    }
}
/** YouTube IFrame Player API 래퍼. videoId 가 바뀌면 플레이어를 다시 만든다. */
declare function useYouTube(videoId: string | null): {
    hostRef: react.RefObject<HTMLDivElement | null>;
    playerRef: react.RefObject<YTPlayer | null>;
    ready: boolean;
};

export { KANA_ONLY, type LyricLabels, type LyricLine, LyricPlayer, type LyricPlayerProps, type LyricToken, type YTPlayer, activeIndexAt, cn, getEmbedUrl, getYouTubeId, hasKanji, isVocal, kanaReading, kanaToKo, splitFurigana, useYouTube, withTimings };
