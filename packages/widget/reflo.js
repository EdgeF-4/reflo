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

  var config = {
    key: '',
    api: '',
    partner: undefined,
    auto: false,
  };
  try {
    var current =
      document.currentScript ||
      (function () {
        var scripts = document.getElementsByTagName('script');
        return scripts[scripts.length - 1];
      })();
    var data = (current && current.dataset) || {};
    config = {
      key: data.refloKey || '',
      api: (data.refloApi || '').replace(/\/$/, ''),
      partner: data.refloPartner || paramFromUrl('ref') || undefined,
      auto: data.refloAuto !== 'false',
    };
  } catch (error) {
    reportFailure(
      'bootstrap',
      error,
      'restore normal script and document access, then reload the host page',
    );
  }

  function paramFromUrl(name) {
    try {
      return new URLSearchParams(window.location.search).get(name) || undefined;
    } catch (e) {
      reportFailure('configuration', e, 'correct the page URL, then reload the page');
      return undefined;
    }
  }

  function errorText(error) {
    try {
      if (error && typeof error.message === 'string') return error.message;
      return String(error || 'unknown failure');
    } catch (_) {
      return 'unreadable error detail';
    }
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
    var body;
    try {
      body = {
        publicKey: config.key,
        type: type,
        sourceSite: window.location.hostname,
        partnerCode: opts.partner || config.partner,
        customerRef: opts.customerRef || customerRef,
      };
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: reportFailure(
          type + ' request configuration',
          error,
          'allow access to window.location and pass plain tracking options, then retry the event',
        ),
      });
    }
    var serialized;
    try {
      serialized = JSON.stringify(body);
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: reportFailure(
          type + ' request payload',
          error,
          'pass a serializable string customerRef and partner value, then retry the event',
        ),
      });
    }
    var request;
    try {
      request = fetch(config.api + '/track/event', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: serialized,
        keepalive: true,
      });
    } catch (error) {
      return Promise.resolve({
        ok: false,
        error: reportFailure(
          type + ' request',
          error,
          'confirm browser fetch support and data-reflo-api, then retry the event',
        ),
      });
    }
    return Promise.resolve(request).then(function (response) {
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
    try {
      var forms = document.querySelectorAll('form[data-reflo-lead]');
      Array.prototype.forEach.call(forms, function (form) {
        try {
          form.addEventListener('submit', function () {
            try {
              var emailField = form.querySelector('input[type="email"], input[name="email"]');
              var ref = emailField && emailField.value ? emailField.value : customerRef;
              send('lead_submit', { customerRef: ref });
            } catch (error) {
              reportFailure(
                'lead form submission',
                error,
                'restore access to the marked form fields, then resubmit the form',
              );
            }
          });
        } catch (error) {
          reportFailure(
            'lead form binding',
            error,
            'use a normal form element for data-reflo-lead, then reload the page',
          );
        }
      });
    } catch (error) {
      reportFailure(
        'lead form discovery',
        error,
        'restore document query access or disable data-reflo-auto, then reload the page',
      );
    }
  }

  try {
    window.reflo = {
      identify: function (ref) {
        if (ref) customerRef = ref;
      },
      track: function (type, opts) {
        return send(type === 'lead' ? 'lead_submit' : 'click', opts);
      },
    };
  } catch (error) {
    reportFailure(
      'public API installation',
      error,
      'allow the window.reflo property to be assigned, then reload the page',
    );
  }

  function startAutoTracking() {
    try {
      send('click');
      bindForms();
    } catch (error) {
      reportFailure(
        'automatic startup',
        error,
        'disable data-reflo-auto and call reflo.track after the document is ready',
      );
    }
  }

  if (config.auto) {
    try {
      // Record the landing click as soon as the page is interactive.
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', startAutoTracking);
      } else {
        startAutoTracking();
      }
    } catch (error) {
      reportFailure(
        'document readiness binding',
        error,
        'disable data-reflo-auto and call reflo.track after the document is ready',
      );
    }
  }
})();
