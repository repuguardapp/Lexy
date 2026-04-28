/**
 * LexyFlow embeddable widget.
 *
 * Usage:
 *   <div data-lexyflow data-locale="fr" data-frameworks="gdpr,eu_ai_act"></div>
 *   <script async src="https://lexyflow.com/widget.js"></script>
 *
 * What it does:
 *   - finds every [data-lexyflow] container on the page;
 *   - injects a sandboxed iframe pointing at /embed/audit with the
 *     data-* options forwarded as query params;
 *   - listens for postMessage events from the iframe to size it
 *     responsively (no scrollbars).
 *
 * Why an iframe:
 *   - keeps Customer's CSS isolated from ours;
 *   - the auditor's source document is uploaded to LexyFlow directly,
 *     never crossing the embedding origin (Zero-Knowledge intact);
 *   - sandbox attribute restricts what the embed can do on the host page.
 */
(function () {
  'use strict';

  if (window.__LexyFlowWidgetLoaded) return;
  window.__LexyFlowWidgetLoaded = true;

  var ORIGIN = (function () {
    var s = document.currentScript || document.querySelector('script[src*="widget.js"]');
    if (!s) return 'https://lexyflow.com';
    try {
      var u = new URL(s.src);
      return u.origin;
    } catch (e) {
      return 'https://lexyflow.com';
    }
  })();

  function buildIframeSrc(container) {
    var url = new URL('/embed/audit', ORIGIN);
    var locale     = container.getAttribute('data-locale');
    var frameworks = container.getAttribute('data-frameworks');
    var theme      = container.getAttribute('data-theme'); // 'light' | 'dark'
    if (locale)     url.searchParams.set('locale', locale);
    if (frameworks) url.searchParams.set('frameworks', frameworks);
    if (theme)      url.searchParams.set('theme', theme);
    url.searchParams.set('host', window.location.hostname);
    return url.toString();
  }

  function mount(container) {
    if (container.__lexyflowMounted) return;
    container.__lexyflowMounted = true;

    var iframe = document.createElement('iframe');
    iframe.src = buildIframeSrc(container);
    iframe.title = 'LexyFlow compliance audit';
    iframe.loading = 'lazy';
    iframe.setAttribute(
      'sandbox',
      'allow-scripts allow-forms allow-popups allow-same-origin'
    );
    iframe.style.cssText =
      'width:100%;border:0;display:block;min-height:520px;background:transparent;';
    container.innerHTML = '';
    container.appendChild(iframe);

    container.__lexyflowIframe = iframe;
  }

  function init() {
    var nodes = document.querySelectorAll('[data-lexyflow]');
    for (var i = 0; i < nodes.length; i++) mount(nodes[i]);
  }

  // Resize iframe based on messages from the embedded page.
  window.addEventListener('message', function (event) {
    if (event.origin !== ORIGIN) return;
    var data = event.data;
    if (!data || data.type !== 'lexyflow:resize' || typeof data.height !== 'number') return;

    var nodes = document.querySelectorAll('[data-lexyflow]');
    for (var i = 0; i < nodes.length; i++) {
      var iframe = nodes[i].__lexyflowIframe;
      if (iframe && iframe.contentWindow === event.source) {
        iframe.style.height = Math.max(320, Math.min(2400, data.height)) + 'px';
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
