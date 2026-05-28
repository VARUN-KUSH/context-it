import { format } from 'date-fns'

interface MediaFile {
  url: string
  width: number
  height: number
}

interface MediaItem {
  id: number
  type: 'photo' | 'video' | 'gif'
  convertedToVideo: boolean
  canView: boolean
  hasError: boolean
  isReady: boolean
  files: {
    full?: MediaFile
    thumb?: MediaFile
    preview?: MediaFile
    squarePreview?: MediaFile
  }
  duration: number
  videoSources: { '720'?: string | null; '240'?: string | null }
}

export interface Message {
  id: string
  fan_id?: string
  from_creator: boolean
  content?: string | null
  media_urls?: MediaItem[]
  price?: number
  sent_at: string
  is_read?: boolean
}

function stripHtml(html: string): string {
  return new DOMParser().parseFromString(html, 'text/html').body.textContent ?? ''
}

function MediaAttachment({ media }: { media: MediaItem }) {
  if (!media.canView || media.hasError) {
    return (
      <div className="rounded-xl bg-black/30 border border-white/10 flex items-center justify-center h-20 text-xs text-gray-500">
        🔒 Locked
      </div>
    )
  }

  // GIF stored as video, or regular video
  if (media.convertedToVideo || media.type === 'video') {
    const src = media.videoSources['720'] ?? media.videoSources['240'] ?? null
    if (!src) return null
    return (
      <video
        src={src}
        className="rounded-xl max-w-full max-h-64 object-cover"
        autoPlay={media.convertedToVideo}
        loop={media.convertedToVideo}
        muted={media.convertedToVideo}
        controls={!media.convertedToVideo}
        playsInline
      />
    )
  }

  // Photo or native GIF
  const imgUrl =
    media.files.preview?.url ?? media.files.thumb?.url ?? media.files.full?.url
  if (!imgUrl) return null

  return (
    <a
      href={media.files.full?.url ?? imgUrl}
      target="_blank"
      rel="noopener noreferrer"
    >
      <img
        src={imgUrl}
        alt=""
        className="rounded-xl max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
        loading="lazy"
      />
    </a>
  )
}

export default function MessageBubble({ message }: { message: Message }) {
  const isCreator = message.from_creator
  const text = message.content ? stripHtml(message.content) : ''
  const media = message.media_urls ?? []
  const hasText = text.trim().length > 0
  const hasMedia = media.length > 0

  // Nothing to render — skip silently (e.g. unsynced media placeholder)
  if (!hasText && !hasMedia) return null

  return (
    <div className={`flex ${isCreator ? 'justify-end' : 'justify-start'} mb-1`}>
      <div
        className={`max-w-[72%] rounded-2xl px-3 py-2 text-sm ${
          isCreator
            ? 'bg-brand-600 text-white rounded-br-sm'
            : 'bg-[#1e1e1e] text-gray-200 rounded-bl-sm'
        }`}
      >
        {!!message.price && (
          <div className="text-[10px] font-semibold text-yellow-300 mb-0.5">
            💲 PPV — ${message.price}
          </div>
        )}

        {hasText && (
          <p className="leading-relaxed break-words">{text}</p>
        )}

        {hasMedia && (
          <div className={`space-y-1 ${hasText ? 'mt-1.5' : ''}`}>
            {media.map((m) => (
              <MediaAttachment key={m.id} media={m} />
            ))}
          </div>
        )}

        <div
          className={`text-[9px] mt-1 ${
            isCreator ? 'text-pink-200 text-right' : 'text-gray-500'
          }`}
        >
          {message.sent_at ? format(new Date(message.sent_at), 'h:mm a') : ''}
        </div>
      </div>
    </div>
  )
}
