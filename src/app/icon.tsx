import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const size = { width: 32, height: 32 };
export const contentType = 'image/png';

/**
 * Favicon — Next 14 file-based metadata.
 * Renders the LexyFlow "L" mark on a dark background.
 */
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 22,
          background: '#0b0b0d',
          color: '#fff',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 700,
          letterSpacing: '-0.02em',
          borderRadius: 6
        }}
      >
        L
      </div>
    ),
    { ...size }
  );
}
