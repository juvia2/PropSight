import { useLayoutEffect, useRef } from 'react'

function fitContent(element) {
  const scrollParent = element.closest('.modal')
  const scrollTop = scrollParent?.scrollTop
  element.style.height = 'auto'
  const style = getComputedStyle(element)
  element.style.height = (element.scrollHeight + parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth)) + 'px'
  element.scrollTop = 0
  if (scrollParent) scrollParent.scrollTop = scrollTop
}

export default function MemoEditor({ defaultValue }) {
  const ref = useRef(null)
  useLayoutEffect(() => {
    const element = ref.current
    fitContent(element)
    let width = element.clientWidth
    const observer = new ResizeObserver(() => {
      if (element.clientWidth !== width) {
        width = element.clientWidth
        fitContent(element)
      }
    })
    observer.observe(element)
    return () => observer.disconnect()
  }, [defaultValue])

  return <textarea ref={ref} className="memo-editor" name="memo" rows={8} maxLength={10000} defaultValue={defaultValue} onInput={event => fitContent(event.currentTarget)} />
}
