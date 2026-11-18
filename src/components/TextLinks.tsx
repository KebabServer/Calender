import type { ComponentPropsWithoutRef, ReactNode } from 'react'
import { find } from 'linkifyjs'

export const webLinkPattern = /^https?:\/\//i

export function WebLink(props: ComponentPropsWithoutRef<'a'>) {
  return <a {...props} target="_blank" rel="noopener noreferrer"/>
}

export function LinkedText({ text }: { text: string }) {
  const parts: ReactNode[] = []
  let start = 0
  for (const link of find(text, 'url', { defaultProtocol: 'https' })) {
    if (!webLinkPattern.test(link.value) && !/^www\./i.test(link.value)) continue
    if (!webLinkPattern.test(link.href)) continue
    parts.push(text.slice(start, link.start), <WebLink key={link.start} href={link.href}>{link.value}</WebLink>)
    start = link.end
  }
  return <>{parts}{text.slice(start)}</>
}
