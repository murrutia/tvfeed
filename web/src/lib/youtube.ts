// Chargement unique de l'API IFrame de YouTube (https://developers.google.com/youtube/iframe_api_reference).

let api: Promise<typeof YT> | undefined

export function loadYouTubeApi(): Promise<typeof YT> {
  api ??= new Promise((resolve) => {
    const w = window as Window & { onYouTubeIframeAPIReady?: () => void }
    w.onYouTubeIframeAPIReady = () => resolve(window.YT)
    const script = document.createElement("script")
    script.src = "https://www.youtube.com/iframe_api"
    document.head.append(script)
  })
  return api
}
