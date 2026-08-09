import type { SVGProps } from 'react'
import type { IconName } from '../types'

type Props = SVGProps<SVGSVGElement> & { name: IconName; size?: number }

export function GameIcon({ name, size = 20, ...props }: Props) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.7,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    ...props,
  }

  const paths: Record<IconName, React.ReactNode> = {
    sun: <><circle cx="12" cy="12" r="3.4" /><path d="M12 2.5v3M12 18.5v3M2.5 12h3M18.5 12h3M5.3 5.3l2.1 2.1M16.6 16.6l2.1 2.1M18.7 5.3l-2.1 2.1M7.4 16.6l-2.1 2.1" /></>,
    grid: <><path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" /><path d="M10 7h4M7 10v4M17 10v4M10 17h4" /></>,
    factory: <><path d="M3.5 20.5v-10l6 3v-4l6 3V6h4v14.5z" /><path d="M7 17h2M12 17h2M17 17h2" /></>,
    leaf: <><path d="M20.5 3.5C11 4 5.5 8 5.2 14.8c-.1 2.5 1.7 4.5 4.2 4.2 6.8-.8 9.8-6.7 11.1-15.5Z" /><path d="M4 21c3.5-6.5 7.8-9.8 13-13" /></>,
    train: <><rect x="5" y="3" width="14" height="15" rx="3" /><path d="M8 7h8M7 12h10M8 21l2-3M16 21l-2-3" /><circle cx="9" cy="15" r="1" fill="currentColor" stroke="none" /><circle cx="15" cy="15" r="1" fill="currentColor" stroke="none" /></>,
    farm: <><path d="M3 20.5h18M5 20.5V10l7-5 7 5v10.5M9 20.5v-6h6v6" /><path d="M12 5V2.5M14.5 3.5C14 2.5 13.2 2.2 12 2.5M9.5 3.5c.5-1 1.3-1.3 2.5-1" /></>,
    waves: <><path d="M3 8.5c2 0 2 1.5 4 1.5s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 2 1.5M3 14c2 0 2 1.5 4 1.5s2-1.5 4-1.5 2 1.5 4 1.5 2-1.5 4-1.5 2 1.5 2 1.5" /><path d="M7 5V3M17 5V3" /></>,
    people: <><circle cx="8" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M2.8 20c.4-4.1 2.2-6.2 5.2-6.2s4.8 2.1 5.2 6.2M14 14.7c.8-.7 1.8-1.1 3-1.1 2.5 0 4 1.8 4.3 5.3" /></>,
    globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c3 3.2 3 14.8 0 18M12 3c-3 3.2-3 14.8 0 18" /></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></>,
    thermometer: <><path d="M9 14.5V5a3 3 0 0 1 6 0v9.5a5 5 0 1 1-6 0Z" /><path d="M12 8v8" /></>,
    cloud: <><path d="M6.5 18.5h11a4 4 0 0 0 .5-8 6.2 6.2 0 0 0-11.7-1.3A4.7 4.7 0 0 0 6.5 18.5Z" /></>,
    shield: <><path d="M12 2.8 20 6v5.5c0 4.6-2.7 8.1-8 9.7-5.3-1.6-8-5.1-8-9.7V6z" /><path d="m8.5 12 2.2 2.2 4.8-5" /></>,
    coins: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v5c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 11v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" /></>,
    spark: <><path d="m12 2 1.6 6.4L20 10l-6.4 1.6L12 18l-1.6-6.4L4 10l6.4-1.6z" /><path d="m19 16 .7 2.3L22 19l-2.3.7L19 22l-.7-2.3L16 19l2.3-.7z" /></>,
    arrow: <><path d="M4 12h15M14 6l6 6-6 6" /></>,
    reset: <><path d="M4 8V3m0 0h5M4 3l3.7 3.7A8 8 0 1 1 5 12" /></>,
    sound: <><path d="M4 10v4h4l5 4V6l-5 4zM16 9c1.5 1.4 1.5 4.6 0 6M19 6.5c3 2.8 3 8.2 0 11" /></>,
    mute: <><path d="M4 10v4h4l5 4V6l-5 4zM17 10l4 4M21 10l-4 4" /></>,
    info: <><circle cx="12" cy="12" r="9" /><path d="M12 11v6M12 7.5h.01" /></>,
    check: <path d="m5 12.5 4.2 4.2L19 7" />,
  }

  return <svg {...common}>{paths[name]}</svg>
}
