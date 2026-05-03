import React from 'react';

/** Standard surface card. Default radius 10px, line border, white bg. */
export function Card({ as: Tag = 'div', padding = 'p-4', className = '', children, ...rest }) {
  return (
    <Tag className={`bg-white border border-line rounded-[10px] ${padding} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}
