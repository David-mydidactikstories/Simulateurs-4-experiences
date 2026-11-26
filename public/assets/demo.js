/* Moteur commun des démos MyDidactik Stories (vente, management, langues).
   Chaque page définit window.DEMO (contenu, choix, prompt de débrief) ; ce fichier fait le reste :
   mise en page, appel vocal (el-demo.js), minuteur, limites, débrief. */
(function () {
  var D = window.DEMO, $ = function (s, r) { return (r || document).querySelector(s); };
  var qs = new URLSearchParams(location.search);
  var prefPrenom = (qs.get("p") || "").replace(/[<>"&]/g, "").slice(0, 30);
  var maxCalls = parseInt(qs.get("n") || "", 10) || D.defaultCalls || 5;
  var maxMin = parseFloat(qs.get("m") || "") || D.maxMin || 4;
  var storeKey = "mds_" + D.key + "_calls";
  var transcript = [], state = { pick: D.picker.items[0].id, extra: {}, prenom: prefPrenom }, tick = null, t0 = 0, timers = [], raf = 0, phase = "setup";
  (D.extras || []).forEach(function (x) { state.extra[x.id] = x.items[Math.min(1, x.items.length - 1)].id; });
  var link = function (path) { return path + (location.search || ""); };

  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function callsUsed() { try { return parseInt(localStorage.getItem(storeKey) || "0", 10) || 0; } catch (e) { return 0; } }
  function bumpCalls() { try { localStorage.setItem(storeKey, String(callsUsed() + 1)); } catch (e) {} }
  function locked() { return maxCalls > 0 && callsUsed() >= maxCalls; }
  function item(id) { return D.picker.items.filter(function (i) { return i.id === id; })[0]; }

  var root = document.body;
  var st = D.accent;
  root.style.setProperty("--accent", st.accent); root.style.setProperty("--soft", st.soft); root.style.setProperty("--on", st.on);
  document.title = D.titleText + " — MyDidactik Stories";

  var handset = '<svg viewBox="0 0 24 24"><path d="M6.6 10.8c1.4 2.8 3.8 5.2 6.6 6.6l2.2-2.2c.3-.3.7-.4 1-.2 1.1.4 2.3.6 3.6.6.6 0 1 .4 1 1V20c0 .6-.4 1-1 1C10.6 21 3 13.4 3 4c0-.6.4-1 1-1h3.5c.6 0 1 .4 1 1 0 1.3.2 2.5.6 3.6.1.3 0 .7-.2 1l-2.3 2.2z"/></svg>';
  var bars = ""; for (var b = 0; b < 21; b++) bars += "<i></i>";

  function missionHtml() {
    var m = D.mission;
    return '<div class="card mission"><h3>' + esc(m.titre) + "</h3>" + m.paras.map(function (p) { return "<p>" + p + "</p>"; }).join("") +
      (m.faits ? '<ul class="facts">' + m.faits.map(function (f) { return "<li>" + f + "</li>"; }).join("") + "</ul>" : "") + "</div>" +
      (D.fiche ? '<details class="fiche"><summary>' + esc(D.fiche.titre) + '</summary><div class="body">' + D.fiche.html + "</div></details>" : "");
  }

  function choicesHtml(label, name, items, row) {
    return '<p class="label">' + esc(label) + '</p><div class="choices' + (row ? " row" : "") + '"' + (row && items.length === 4 ? ' style="grid-template-columns:repeat(2,1fr)"' : "") + ' role="radiogroup" data-name="' + name + '">' +
      items.map(function (i) {
        var on = (name === "pick" ? state.pick : state.extra[name]) === i.id;
        return '<button type="button" class="choice" role="radio" aria-checked="' + on + '" data-id="' + i.id + '"><span class="ico">' + esc(i.ico || i.nom[0]) + "</span><span><b>" + esc(i.nom) + "</b>" +
          (i.sous ? "<small>" + esc(i.sous) + "</small>" : "") + "</span>" + (i.diff ? '<span class="diff">' + esc(i.diff) + "</span>" : "") + "</button>";
      }).join("") + "</div>";
  }

  function setupHtml() {
    var h = "<h2>" + esc(D.setupTitre || "Prépare ton appel") + "</h2>";
    if (locked()) {
      return h + '<div class="hint">Tu as utilisé tes ' + maxCalls + " essai" + (maxCalls > 1 ? "s" : "") + " pour cette démo. Pour en refaire, écris-moi : <a href=\"" + link("/") + '#contact">demander une démo</a>.</div>';
    }
    h += choicesHtml(D.picker.label, "pick", D.picker.items, D.picker.row);
    (D.extras || []).forEach(function (x) { h += choicesHtml(x.label, x.id, x.items, x.row !== false); });
    h += '<label class="field"><span class="label">Ton prénom (facultatif)</span><input id="prenom" maxlength="30" autocomplete="given-name" value="' + esc(state.prenom) + '" placeholder="Pour que ton interlocuteur t\'appelle par ton prénom"></label>';
    h += '<div id="err" class="err" hidden></div>';
    h += '<button class="cta" id="go" type="button">' + esc(D.cta || "Passer l'appel") + "</button>";
    h += '<p class="note">Il te faut un micro et des écouteurs de préférence. L\'appel dure ' + (maxMin >= 1 ? Math.round(maxMin) + " minutes maximum" : "peu de temps") +
      ". Tout est fictif : n'utilise pas de vraies données personnelles.</p>";
    if (maxCalls) h += '<p class="note">Essais restants : ' + Math.max(0, maxCalls - callsUsed()) + " sur " + maxCalls + ".</p>";
    return h;
  }

  function pageHtml() {
    var it = item(state.pick);
    return '<header class="top"><a class="brand" href="' + link("/") + '"><span class="dot">' + handset + "</span>MyDidactik Stories</a>" +
      (prefPrenom ? '<span class="who">Démo préparée pour ' + esc(prefPrenom) + "</span>" : "") +
      '<a class="back" href="' + link("/") + '">← Toutes les démos</a></header>' +
      '<main class="demo"><section class="intro"><span class="tag">' + esc(D.tag) + "</span><h1>" + D.title + '</h1><p class="lead">' + D.lead + "</p>" + missionHtml() + "</section>" +
      '<section class="stage" id="stage"><div class="sun"></div><div class="phone"><div class="screen"><div class="notch"></div>' +
      '<div class="status"><span id="clock">--:--</span><span>appel</span></div>' +
      '<div class="callee"><div class="name" id="cname">' + esc(it.nom) + '</div><div class="role" id="crole">' + esc(it.role || it.sous || "") + "</div></div>" +
      '<div class="callstate" id="cstate">Prêt à appeler</div><div class="bars" id="bars">' + bars + "</div>" +
      '<div class="mic" id="mic"><span>micro</span><span class="m"><b id="micb"></b></span></div>' +
      '<div class="callbtns"><button class="rnd green" id="dial" aria-label="Appeler">' + handset + '</button><button class="rnd red" id="hang" aria-label="Raccrocher">' + handset + "</button></div>" +
      '</div></div></section><section class="panel" id="panel">' + setupHtml() + "</section></main>" +
      '<footer class="foot">Voix et scénario générés par IA. Exercice fictif, sans enregistrement sur ce site.</footer>';
  }

  var el = {};
  function grab() { ["stage", "panel", "cstate", "cname", "crole", "clock", "micb", "bars"].forEach(function (k) { el[k] = document.getElementById(k); }); el.bar = [].slice.call(document.querySelectorAll("#bars i")); }

  function bindSetup() {
    [].forEach.call(document.querySelectorAll(".choices"), function (g) {
      g.addEventListener("click", function (e) {
        var b = e.target.closest(".choice"); if (!b) return;
        var name = g.getAttribute("data-name"), id = b.getAttribute("data-id");
        if (name === "pick") { state.pick = id; var it = item(id); el.cname.textContent = it.nom; el.crole.textContent = it.role || it.sous || ""; }
        else state.extra[name] = id;
        [].forEach.call(g.children, function (c) { c.setAttribute("aria-checked", c === b ? "true" : "false"); });
      });
    });
    var pn = document.getElementById("prenom"); if (pn) pn.addEventListener("input", function () { state.prenom = pn.value.replace(/[<>"&]/g, "").slice(0, 30); });
    var go = document.getElementById("go"); if (go) go.addEventListener("click", startCall);
  }

  function showErr(msg) { var e = document.getElementById("err"); if (!e) return; e.textContent = msg; e.hidden = false; }
  function mmss(s) { s = Math.max(0, Math.floor(s)); return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0"); }

  function animate() {
    var L = window.DemoVoice.levels(), now = performance.now() / 1000;
    el.bar.forEach(function (bar, i) {
      var c = 1 - Math.abs(i - 10) / 11, idle = 6 + 4 * Math.sin(now * 2 + i * 0.7);
      var h = phase === "live" ? idle + L.out * 110 * (0.35 + c * (0.65 + 0.35 * Math.sin(now * 9 + i))) : (phase === "connecting" ? idle + 6 * Math.sin(now * 5 + i) : 8);
      bar.style.height = Math.max(6, Math.min(118, h)) + "px";
    });
    el.micb.style.width = Math.round((phase === "live" ? L.mic : 0) * 100) + "%";
    raf = requestAnimationFrame(animate);
  }

  function setPhase(p, text) {
    phase = p; el.stage.classList.toggle("live", p === "live"); el.stage.classList.toggle("connecting", p === "connecting");
    el.cstate.textContent = text || "";
  }

  function clearTimers() { timers.forEach(clearTimeout); timers = []; if (tick) { clearInterval(tick); tick = null; } }

  function varsFor() {
    var v = { prenom: state.prenom || "Berty" };
    if (D.vars) { var x = D.vars(state, item(state.pick)); for (var k in x) v[k] = x[k]; }
    return v;
  }

  function startCall() {
    if (locked()) return;
    transcript = []; bumpCalls();
    setPhase("connecting", "Appel en cours…");
    var go = document.getElementById("go"); if (go) go.disabled = true;
    document.getElementById("panel").innerHTML = '<h2>Appel en cours</h2><div class="hint">' + (D.liveHint || "Parle naturellement, comme au téléphone.") + "</div>" +
      '<button class="cta ghost" id="hang2" type="button">Raccrocher</button>';
    document.getElementById("hang2").addEventListener("click", function () { endCall("abandon"); });
    if (window.innerWidth < 1100) el.stage.scrollIntoView({ behavior: "smooth", block: "center" });
    window.DemoVoice.start({
      demo: D.key, variante: D.variante ? D.variante(state) : state.pick, vars: varsFor(),
      onReady: function () {
        t0 = Date.now(); setPhase("live", "00:00");
        tick = setInterval(function () { el.cstate.textContent = mmss((Date.now() - t0) / 1000); }, 500);
        timers.push(setTimeout(function () { window.DemoVoice.warn("Régie : l'appel dure depuis presque " + Math.max(1, Math.round(maxMin - 0.5)) + " minutes. Conclus poliment, dans ton personnage, maintenant, puis appelle fin_appel_demo avec le motif timeout si rien n'est réglé."); }, Math.max(20, (maxMin - 1) * 60) * 1000));
        timers.push(setTimeout(function () { endCall("timeout"); }, (maxMin + 0.5) * 60 * 1000));
      },
      onLine: function (role, text) { transcript.push({ role: role, text: text }); },
      onHangup: function (motif) { endCall(motif, true); },
      onError: function (msg) { clearTimers(); setPhase("idle", "Prêt à appeler"); renderSetup(); showErr(msg); }
    });
  }

  function renderSetup() {
    phase = "idle"; document.getElementById("panel").innerHTML = setupHtml(); bindSetup();
  }

  var ended = false;
  function endCall(motif, fromAgent) {
    if (ended) return; ended = true; setTimeout(function () { ended = false; }, 800);
    clearTimers(); window.DemoVoice.stop(); setPhase("idle", "Appel terminé");
    var userLines = transcript.filter(function (l) { return l.role === "user"; }).length;
    var p = document.getElementById("panel");
    if (userLines < 2) {
      p.innerHTML = '<h2>Appel trop court</h2><div class="hint">Je n\'ai pas assez de paroles pour faire un vrai débrief. Relance un appel et laisse la conversation s\'installer.</div><button class="cta" id="again" type="button">Refaire un appel</button>';
      document.getElementById("again").addEventListener("click", function () { setPhase("idle", "Prêt à appeler"); renderSetup(); });
      return;
    }
    p.innerHTML = '<div class="debrief"><h2>Ton débrief</h2><div class="loading"><span class="spin"></span>Ton formateur relit la conversation…</div></div>';
    var text = transcript.map(function (l) { return (l.role === "user" ? "APPRENANT" : "INTERLOCUTEUR") + " : " + l.text; }).join("\n");
    var prompt = D.debrief({ state: state, item: item(state.pick), motif: motif, transcript: text, fromAgent: !!fromAgent });
    fetch("/api/debrief", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt: prompt }) })
      .then(function (r) { if (!r.ok) throw new Error("debrief " + r.status); return r.json(); })
      .then(function (j) { renderDebrief(j, motif, text); })
      .catch(function () { p.innerHTML = '<h2>Débrief indisponible</h2><div class="hint">L\'analyse n\'a pas pu se faire cette fois. Ton appel a bien eu lieu : tu peux en refaire un.</div><button class="cta" id="again" type="button">Refaire un appel</button>'; document.getElementById("again").addEventListener("click", function () { setPhase("idle", "Prêt à appeler"); renderSetup(); }); });
  }

  function list(arr) { return arr && arr.length ? "<ul>" + arr.map(function (x) { return "<li>" + esc(x) + "</li>"; }).join("") + "</ul>" : ""; }

  function renderDebrief(j, motif, text) {
    var issue = ["gagne", "moyen", "perdu"].indexOf(j.issue) >= 0 ? j.issue : "moyen";
    var lab = (D.issues || { gagne: "Réussi", moyen: "Mitigé", perdu: "À retravailler" })[issue];
    var h = '<div class="debrief"><span class="verdict ' + issue + '">' + esc(lab) + "</span>" +
      (D.motifs && D.motifs[motif] ? ' <span class="diff">' + esc(D.motifs[motif]) + "</span>" : "") +
      "<h2>" + esc(j.titre || "Débrief") + '</h2><p class="resume">' + esc(j.resume || "") + '</p><div class="cols">';
    if (j.forts && j.forts.length) h += '<div class="box good"><h4>Ce qui a marché</h4>' + list(j.forts) + "</div>";
    if (j.faibles && j.faibles.length) h += '<div class="box bad"><h4>Ce qui a coincé</h4>' + list(j.faibles) + "</div>";
    if (j.corrections && j.corrections.length) {
      h += '<div class="box"><h4>Corrections</h4><div class="corr">' + j.corrections.slice(0, 6).map(function (c) {
        return "<div><span class=\"dit\">" + esc(c.dit) + "</span> → <span class=\"mieux\">" + esc(c.mieux) + "</span>" + (c.pourquoi ? "<small>" + esc(c.pourquoi) + "</small>" : "") + "</div>";
      }).join("") + "</div></div>";
    }
    if (j.cle) h += '<div class="box key"><h4>' + esc(D.cleTitre || "La clé") + "</h4><p>" + esc(j.cle) + "</p></div>";
    if (j.aRetenir) h += '<div class="box retain"><h4>À retenir</h4><p>' + esc(j.aRetenir) + "</p></div>";
    h += '</div><details class="fiche"><summary>Voir la transcription</summary><div class="body transcript">' +
      text.split("\n").map(function (l) { var i = l.indexOf(" : "); return "<p><b>" + esc(l.slice(0, i)) + "</b>" + esc(l.slice(i + 3)) + "</p>"; }).join("") + "</div></details>" +
      '<div class="actions"><button class="cta" id="again" type="button">Refaire un appel</button><a class="cta ghost" style="text-align:center;text-decoration:none" href="' + link("/") + '">Voir les autres démos</a></div></div>';
    document.getElementById("panel").innerHTML = h;
    document.getElementById("again").addEventListener("click", function () { setPhase("idle", "Prêt à appeler"); renderSetup(); window.scrollTo({ top: 0, behavior: "smooth" }); });
    if (window.innerWidth < 1100) document.getElementById("panel").scrollIntoView({ behavior: "smooth" });
  }

  document.getElementById("app").innerHTML = pageHtml();
  grab(); bindSetup();
  document.getElementById("hang").addEventListener("click", function () { endCall("abandon"); });
  document.getElementById("dial").addEventListener("click", function () { var g = document.getElementById("go"); if (g) g.click(); });
  setInterval(function () { var d = new Date(); el.clock.textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); }, 10000);
  (function () { var d = new Date(); el.clock.textContent = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0"); })();
  animate();
})();
