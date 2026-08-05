import { DOCS_CDN_CSS, DOCS_CDN_JS } from "./types";

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * KitBag / Bruno-style HTML shell.
 * Uses Bruno docs CDN for fonts + layout; Fishman branding + no Try/Run.
 */
export function buildDocumentationHtmlShell(options: {
  collectionName: string;
  escapedYamlJsLiteral: string;
  theme?: "light" | "dark";
}): string {
  const title = escapeHtml(options.collectionName);
  const theme = options.theme ?? "light";

  return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title} - API Documentation</title>
    <link rel="preconnect" href="https://cdn.usebruno.com" crossorigin>
    <style>
        body { margin: 0; padding: 0; }
        #opencollection-container { width: 100vw; height: 100vh; }

        /* Docs-only: hide Try / Run / playground runner UI */
        .playground-runner,
        .playground-console,
        .mobile-tab[data-tab="runner"],
        .mobile-tab[data-tab="console"],
        button.try-btn,
        .try-button,
        [data-testid="try-button"],
        [aria-label="Try"],
        [aria-label="Try it"],
        [aria-label="Try It"],
        button[title="Try"],
        button[title="Try it"] {
          display: none !important;
        }

        /* Fishman watermark (bottom-left) */
        .fishman-docs-watermark {
          position: fixed;
          left: 14px;
          bottom: 12px;
          z-index: 9999;
          display: inline-flex;
          align-items: center;
          gap: 8px;
          padding: 6px 10px;
          border-radius: 8px;
          background: rgba(255,255,255,0.92);
          border: 1px solid rgba(0,0,0,0.08);
          box-shadow: 0 1px 3px rgba(0,0,0,0.06);
          font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
          font-size: 12px;
          color: #343434;
          pointer-events: none;
          user-select: none;
        }
        .fishman-docs-watermark svg { display: block; }
        .fishman-docs-watermark span { font-weight: 600; letter-spacing: 0.01em; }
    </style>
    <link rel="stylesheet" href="${DOCS_CDN_CSS}">
    <script src="${DOCS_CDN_JS}"></script>
</head>
<body>
    <div id="opencollection-container"></div>
    <div class="fishman-docs-watermark" aria-hidden="true">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M4 12c2-6 6-9 8-9s6 3 8 9c-2 6-6 9-8 9s-6-3-8-9z" stroke="#0ea5e9" stroke-width="1.6" fill="#e0f2fe"/>
        <circle cx="14.5" cy="10.5" r="1.2" fill="#0369a1"/>
      </svg>
      <span>Fishman</span>
    </div>
    <script>
        const collectionData = ${options.escapedYamlJsLiteral};

        function hideTryAndBrand() {
          const hideSelectors = [
            '.playground-runner',
            '.playground-console',
            'button[aria-label="Try"]',
            'button[aria-label="Try it"]',
            'button[title="Try"]',
            'button[title="Try it"]'
          ];
          for (const sel of hideSelectors) {
            document.querySelectorAll(sel).forEach(function (el) {
              el.style.setProperty('display', 'none', 'important');
            });
          }
          // Replace opencollection / Bruno watermark text with Fishman
          document.querySelectorAll('a, span, div, p, button').forEach(function (el) {
            if (el.closest && el.closest('.fishman-docs-watermark')) return;
            if (el.children && el.children.length > 0) return;
            var t = (el.textContent || '').trim().toLowerCase();
            if (t === 'opencollection' || t === 'bruno' || t === 'powered by opencollection' || t === 'powered by bruno') {
              el.textContent = 'Fishman';
            }
          });
          // Hide leftover brand images that are clearly the CDN watermark
          document.querySelectorAll('img[alt*="opencollection" i], img[alt*="bruno" i]').forEach(function (el) {
            el.style.setProperty('display', 'none', 'important');
          });
        }

        function bootDocs() {
          var target = document.getElementById('opencollection-container');
          var opts = {
            target: target,
            element: target,
            opencollection: collectionData,
            collection: collectionData,
            theme: '${theme}',
            viewMode: 'docs'
          };

          try {
            if (typeof window.OpenCollection === 'function') {
              new window.OpenCollection(opts);
            } else if (window.OpenCollectionPlayground) {
              var P = window.OpenCollectionPlayground;
              if (typeof P === 'function') {
                new P(opts);
              } else if (typeof P.init === 'function') {
                P.init(opts);
              } else if (typeof P.render === 'function') {
                P.render(target, opts);
              } else if (typeof P.create === 'function') {
                P.create(opts);
              } else if (typeof P.mount === 'function') {
                P.mount(opts);
              }
            }
          } catch (err) {
            console.error('Fishman docs viewer failed to start', err);
            target.innerHTML = '<div style="padding:24px;font-family:system-ui,sans-serif">' +
              '<h1 style="margin:0 0 8px">Could not load documentation viewer</h1>' +
              '<p style="color:#666">The CDN script may be blocked or offline. Check your network connection.</p>' +
              '</div>';
          }

          hideTryAndBrand();
          setTimeout(hideTryAndBrand, 250);
          setTimeout(hideTryAndBrand, 1000);
          var obs = new MutationObserver(hideTryAndBrand);
          obs.observe(document.body, { childList: true, subtree: true });
        }

        if (document.readyState === 'loading') {
          document.addEventListener('DOMContentLoaded', bootDocs);
        } else {
          bootDocs();
        }
    </script>
</body>
</html>
`;
}
