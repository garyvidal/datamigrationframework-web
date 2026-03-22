// Splitter — Draggable resize bar for dividing two adjacent panels horizontally or vertically.
import React, { useState } from 'react';
import {cn} from '@/lib/Utils';
const Splitter = ({
  id = 'drag-bar',
  dir,
  isDragging,
  ...props
}: any) => {
  const [isFocused, setIsFocused] = useState(false)

  return (
    <div
      id={id}
      data-testid={id}
      tabIndex={0}
      className={cn(
        'drag-bar',
        dir === 'horizontal' && 'drag-bar--horizontal',
        (isDragging || isFocused) && 'drag-bar--dragging'
      )}
      onFocus={() => setIsFocused(true)}
      onBlur={() => setIsFocused(false)}
      {...props}
    />
  )
}

export default Splitter