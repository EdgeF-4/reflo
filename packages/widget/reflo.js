/*!
 * Reflo tracking widget. First-party, cookie-free. Drop one script tag on any
 * page and it records clicks and lead submissions against a stable first-party
 * identity stored in localStorage. The server authenticates the public key and
 * validates the calling domain, so the key is safe to ship in the page.
 *
 *   <script src="https://your-api/reflo.js"
 *           data-reflo-key="pk_live_pro_8f2a"
 *           data-reflo-api="https://your-api"
 *           data-reflo-partner="creator-pro"
 *           data-reflo-auto="true"></script>
 *
 * Programmatic API: window.reflo.identify(ref), window.reflo.track(type, opts).
 */
(function () {
  'use strict';

  var current =
    document.currentScript ||
    (function () {
      var s = document.getElementsByTagName('script');
      return s[s.length - 1];
    })();
  var data = (current && current.dataset) || {};

  var config = {
    key: data.refloKey || '',
    api: (data.refloApi || '').replace(/\/$/, ''),
    partner: data.refloPartner || paramFromUrl('ref') || undefined,
    auto: data.refloAuto !== 'false',
  };

  function paramFromUrl(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || undefined;
    } catch (e) {
      reportFailure('configuration', e, 'correct the page URL, then reload the page');
      return undefined;
    }
  }

  function errorText(error) {
    if (error && typeof error.message === 'string') return error.message;
    return String(error || 'unknown failure');
  }

  function reportFailure(operation, error, next) {
    var detail =
      'Reflo tracking ' + operation + ' failed: ' + errorText(error) + '. Next: ' + next + '.';
    try {
      window.dispatchEvent(
        new CustomEvent('reflo:tracking-error', {
          detail: { operation: operation, message: detail },
        }),
      );
    } catch (eventError) {
      detail +=
        ' Error notification also failed: ' +
        errorText(eventError) +
        '. Next: inspect the browser console and integration code before retrying.';
    }
    try {
      if (window.console && typeof window.console.error === 'function') {
        window.console.error(detail);
      }
    } catch (consoleError) {
      detail +=
        ' Browser console reporting also failed: ' +
        errorText(consoleError) +
        '. Next: inspect the returned error value before retrying.';
    }
    return detail;
  }

  // A stable, anonymous first-party identifier. No third-party cookie involved.
  function uid() {
    var k = 'reflo_uid';
    try {
      var existing = window.localStorage.getItem(k);
      if (existing) return existing;
      var generated =
        'r_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      window.localStorage.setItem(k, generated);
      return generated;
    } catch (e) {
      reportFailure(
        'identity storage',
        e,
        'allow first-party localStorage for stable attribution or accept a per-page identity',
      );
      return 'r_session_' + Math.random().toString(36).slice(2, 10);
    }
  }

  var customerRef = uid();

  function send(type, opts) {
    if (!config.key || !config.api) {
      return Promise.resolve({
        ok: false,
        error: reportFailure(
          'configuration',
          'data-reflo-key or data-reflo-api is missing',
          'set both data attributes on the script tag, then reload the page',
        ),
      });
    }
    opts = opts || {};
    var body = {
      publicKey: config.key,
      type: type,
      sourceSite: window.location.hostname,
      partnerCode: opts.partner || config.partner,
      customerRef: opts.customerRef || customerRef,
    };
    return fetch(config.api + '/track/event', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      keepalive: true,
    }).then(function (response) {
      if (!response.ok) {
        return response.text().catch(function (readError) {
          return 'could not read response body: ' + errorText(readError);
        }).then(function (bodyText) {
          return {
            ok: false,
            status: response.status,
            error: reportFailure(
              type + ' request',
              'HTTP ' + response.status + (bodyText ? ': ' + bodyText.slice(0, 200) : ''),
              'verify the public key and allowed domain in the API, then retry the event',
            ),
          };
        });
      }
      return { ok: true, status: response.status };
    }).catch(function (error) {
      return {
        ok: false,
        error: reportFailure(
          type + ' request',
          error,
          'confirm the API is reachable and data-reflo-api is correct, then retry the event',
        ),
      };
    });
  }

  function bindForms() {
    var forms = document.querySelectorAll('form[data-reflo-lead]');
    Array.prototype.forEach.call(forms, function (form) {
      form.addEventListener('submit', function () {
        var emailField = form.querySelector('input[type="email"], input[name="email"]');
        var ref = emailField && emailField.value ? emailField.value : customerRef;
        send('lead_submit', { customerRef: ref });
      });
    });
  }

  window.reflo = {
    identify: function (ref) {
      if (ref) customerRef = ref;
    },
    track: function (type, opts) {
      return send(type === 'lead' ? 'lead_submit' : 'click', opts);
    },
  };

  if (config.auto) {
    // Record the landing click as soon as the page is interactive.
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        send('click');
        bindForms();
      });
    } else {
      send('click');
      bindForms();
    }
  }
})();
