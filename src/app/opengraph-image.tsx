import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'LexyFlow — Global compliance, automated.';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

/**
 * Default Open Graph image. Sober, monochrome, instantly recognisable
 * as LexyFlow when shared on Slack/Twitter/LinkedIn.
 */
export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#0b0b0d',
          color: '#fff',
          padding: 80,
          fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
        }}
      >
        {/* Top: brand */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div
            style={{
              width: 56,
              height: 56,
              border: '2px solid #fff',
              borderRadius: 12,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 36,
              fontWeight: 700
            }}
          >
            L
          </div>
          <div style={{ fontSize: 36, fontWeight: 600, letterSpacing: '-0.02em' }}>
            LexyFlow
          </div>
        </div>

        {/* Middle: tagline */}
        <div
          style={{
            display: 'flex',
            flex: 1,
            alignItems: 'center'
          }}
        >
          <div
            style={{
              fontSize: 84,
              fontWeight: 600,
              letterSpacing: '-0.04em',
              lineHeight: 1.05,
              maxWidth: 900
            }}
          >
            Global compliance, automated.
          </div>
        </div>

        {/* Bottom: framework chips + url */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 12 }}>
            {['GDPR', 'EU AI Act', 'LGPD', 'APPI'].map((name) => (
              <div
                key={name}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  border: '1px solid #2a2a2e',
                  borderRadius: 999,
                  padding: '8px 16px',
                  fontSize: 22,
                  color: '#a8a8b0'
                }}
              >
                {name}
              </div>
            ))}
          </div>
          <div style={{ fontSize: 26, color: '#a8a8b0' }}>lexyflow.com</div>
        </div>
      </div>
    ),
    { ...size }
  );
}
