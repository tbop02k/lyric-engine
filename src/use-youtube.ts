import { useEffect, useRef, useState } from "react"

export type YTPlayer = {
  getCurrentTime: () => number
  getDuration: () => number
  getPlayerState: () => number
  seekTo: (seconds: number, allowSeekAhead: boolean) => void
  playVideo: () => void
  pauseVideo: () => void
  destroy: () => void
}

declare global {
  interface Window {
    YT?: { Player: new (el: Element, opts: unknown) => YTPlayer }
    onYouTubeIframeAPIReady?: () => void
  }
}

let apiPromise: Promise<NonNullable<Window["YT"]>> | null = null

function loadApi(): Promise<NonNullable<Window["YT"]>> {
  if (apiPromise) return apiPromise
  apiPromise = new Promise((resolve) => {
    if (window.YT?.Player) return resolve(window.YT)
    const prev = window.onYouTubeIframeAPIReady
    window.onYouTubeIframeAPIReady = () => {
      prev?.()
      if (window.YT?.Player) resolve(window.YT)
    }
    const tag = document.createElement("script")
    tag.src = "https://www.youtube.com/iframe_api"
    document.head.appendChild(tag)
  })
  return apiPromise
}

/** YouTube IFrame Player API 래퍼. videoId 가 바뀌면 플레이어를 다시 만든다. */
export function useYouTube(videoId: string | null) {
  const hostRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<YTPlayer | null>(null)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    const host = hostRef.current
    if (!videoId || !host) return
    let cancelled = false
    setReady(false)
    const mount = document.createElement("div")
    mount.className = "size-full"
    host.appendChild(mount)

    loadApi().then((YT) => {
      if (cancelled) return
      playerRef.current = new YT.Player(mount, {
        videoId,
        width: "100%",
        height: "100%",
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            if (!cancelled) setReady(true)
          },
        },
      })
    })

    return () => {
      cancelled = true
      setReady(false)
      try {
        playerRef.current?.destroy()
      } catch {
        /* noop */
      }
      playerRef.current = null
      host.innerHTML = ""
    }
  }, [videoId])

  return { hostRef, playerRef, ready }
}
