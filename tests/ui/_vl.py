"""Gedeelde instellingen voor de UI-tests van Vaste Lasten (Python + Playwright).

Elke test begint met `import _vl` en gebruikt `_vl.APP` als map die de testserver serveert
(de hoofdmap van de repository, met index.html).

Sinds 3.x (PWA-Core) toont de app bij de eerste start eerst het scherm "Kies je gegevenskluis".
De meeste UI-tests werken met de ingebouwde voorbeeldgegevens. Dit bestand zorgt dat elke nieuwe
browsercontext dat scherm automatisch sluit (zoals de knop "Oude synchronisatie-instellingen openen", maar zonder
van tabblad te wisselen). De app start dan met de voorbeeldgegevens, zoals vóór 3.x. Wil een test het kluisscherm zelf testen, maak de context
dan aan met `_vl.met_kluisscherm(browser, ...)`.
"""
import os
from playwright.sync_api._generated import Browser

TESTS = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(TESTS, '..', '..'))       # hoofdmap van de repository
SCREENS = os.path.join(TESTS, 'screens') + '/'
os.makedirs(SCREENS, exist_ok=True)

GATE_SCRIPT = r"""
(()=>{
  if (window.__vlGate) return; window.__vlGate = true;
  // Sluit het kluisscherm met de knop "Oude synchronisatie-instellingen openen". Die knop springt naar
  // Instellingen > Synchronisatie; dat maken we ongedaan, zodat opgeslagen keuzes (tabblad, gekozen
  // groep in Instellingen) blijven zoals de test ze heeft klaargezet.
  const UIKEY = 'vastelasten.ui';
  const tryClose = () => {
    const b = document.getElementById('core-vault-existing');
    if (!b) return false;
    let saved = null; try { saved = JSON.parse(localStorage.getItem(UIKEY) || 'null'); } catch (e) {}
    const setItem = Storage.prototype.setItem, siv = Element.prototype.scrollIntoView;
    Storage.prototype.setItem = function (k, v) { if (k !== UIKEY) return setItem.call(this, k, v); };
    Element.prototype.scrollIntoView = function () {};
    try { b.click(); } finally { Storage.prototype.setItem = setItem; Element.prototype.scrollIntoView = siv; }
    const tab = document.getElementById('t-' + ((saved && saved.tab) || 'overzicht')) || document.getElementById('t-overzicht');
    if (tab) tab.click();
    const sg = saved && saved.setSel && document.querySelector('#setNav [data-sg="' + saved.setSel + '"]');
    if (sg) sg.click();
    window.scrollTo(0, 0);
    return true;
  };
  const start = () => {
    if (tryClose()) return;
    const mo = new MutationObserver(() => { if (tryClose()) mo.disconnect(); });
    mo.observe(document.documentElement, {childList: true, subtree: true});
    setTimeout(() => mo.disconnect(), 10000);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
"""

_orig_new_context = Browser.new_context


def _new_context(self, *args, **kwargs):
    ctx = _orig_new_context(self, *args, **kwargs)
    ctx.add_init_script(GATE_SCRIPT)
    return ctx


def met_kluisscherm(browser, *args, **kwargs):
    """Browsercontext zonder het automatisch wegklikken van het kluisscherm."""
    return _orig_new_context(browser, *args, **kwargs)


Browser.new_context = _new_context
