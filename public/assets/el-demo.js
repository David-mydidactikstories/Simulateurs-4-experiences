/* Appel vocal ElevenLabs pour les démos vente / management / langues.
   DemoVoice.start({ demo, variante, vars, onReady, onHangup(motif), onError(msg), onLine(role, texte) })
   Le motif de fin arrive par l'outil client « fin_appel_demo » (accord / refus / rappel / fin / troll / timeout). */
(function () {
  var ws = null, inCtx = null, outCtx = null, analyser = null, stream = null, proc = null, nextT = 0, sources = [];
  var stopped = true, h = {}, outRate = 16000, motif = "", finTimer = null, ready = false, micLevel = 0, buf8 = null;

  function pcm16Base64(f32, srcRate) {
    var ratio = srcRate / 16000, n = Math.max(1, Math.floor(f32.length / ratio)), b = new ArrayBuffer(n * 2), v = new DataView(b);
    for (var i = 0; i < n; i++) {
      var pos = i * ratio, idx = Math.floor(pos), frac = pos - idx;
      var a = f32[idx] || 0, c = f32[Math.min(idx + 1, f32.length - 1)] || a;
      var s = Math.max(-1, Math.min(1, a + (c - a) * frac));
      v.setInt16(i * 2, Math.round(s < 0 ? s * 0x8000 : s * 0x7fff), true);
    }
    var bytes = new Uint8Array(b), bin = "";
    for (var j = 0; j < bytes.length; j += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(j, j + 0x8000));
    return btoa(bin);
  }

  function play(b64) {
    if (!outCtx) return;
    var bin = atob(b64), len = bin.length, bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    var count = Math.floor(len / 2), view = new DataView(bytes.buffer);
    var b = outCtx.createBuffer(1, Math.max(1, count), outRate), ch = b.getChannelData(0);
    for (var k = 0; k < count; k++) ch[k] = view.getInt16(k * 2, true) / 32768;
    var src = outCtx.createBufferSource();
    src.buffer = b; src.connect(analyser || outCtx.destination);
    var t = Math.max(outCtx.currentTime + 0.015, nextT);
    nextT = t + b.duration;
    sources.push(src);
    src.onended = function () { sources = sources.filter(function (s) { return s !== src; }); };
    src.start(t);
  }

  function flush() { sources.forEach(function (s) { try { s.stop(); } catch (e) {} }); sources = []; nextT = 0; }

  function teardown() {
    stopped = true;
    if (finTimer) { clearTimeout(finTimer); finTimer = null; }
    flush();
    if (proc) { proc.onaudioprocess = null; try { proc.disconnect(); } catch (e) {} proc = null; }
    if (stream) { stream.getTracks().forEach(function (t) { t.stop(); }); stream = null; }
    if (inCtx) { inCtx.close().catch(function () {}); inCtx = null; }
    if (outCtx) { outCtx.close().catch(function () {}); outCtx = null; }
    analyser = null; micLevel = 0;
    if (ws) { var w = ws; ws = null; w.onmessage = w.onerror = w.onclose = null; try { w.close(1000); } catch (e) {} }
  }

  function fail(msg) { var hh = h; teardown(); if (hh.onError) hh.onError(msg); }

  function micMessage(e) {
    if (e && e.name === "NotAllowedError") return "Le micro est bloqué. Autorise-le dans la barre d'adresse du navigateur, puis relance l'appel.";
    if (e && e.name === "NotFoundError") return "Aucun micro détecté sur cet appareil.";
    return "Le micro n'est pas disponible (" + (e && e.name ? e.name : "erreur") + ").";
  }

  function finish() {
    if (stopped) return;
    var wait = outCtx ? Math.max(0, (nextT - outCtx.currentTime) * 1000) : 0;
    var hh = h, why = motif || "fin";
    stopped = true;
    setTimeout(function () { teardown(); if (hh.onHangup) hh.onHangup(why); }, wait + 600);
  }

  window.DemoVoice = {
    start: function (opt) {
      teardown();
      h = opt || {}; stopped = false; motif = ""; ready = false;
      var AC = window.AudioContext || window.webkitAudioContext;
      outCtx = new AC();
      outCtx.resume().catch(function () {});
      analyser = outCtx.createAnalyser(); analyser.fftSize = 512; analyser.connect(outCtx.destination);
      buf8 = new Uint8Array(analyser.fftSize);

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return fail("Le micro n'est pas accessible ici (il faut une page en https).");
      var micP = navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
      var urlP = fetch("/api/demo-session?demo=" + encodeURIComponent(h.demo) + "&variante=" + encodeURIComponent(h.variante)).then(function (r) {
        return r.json().then(function (j) { if (!r.ok || !j.signedUrl) throw new Error(j.error || "Session vocale indisponible."); return j.signedUrl; });
      });
      Promise.all([micP, urlP]).then(function (res) {
        var s = res[0], signedUrl = res[1];
        if (stopped) { s.getTracks().forEach(function (t) { t.stop(); }); return; }
        stream = s;
        ws = new WebSocket(signedUrl);
        ws.onopen = function () {
          ws.send(JSON.stringify({ type: "conversation_initiation_client_data", dynamic_variables: h.vars || {} }));
          inCtx = new AC({ sampleRate: 16000 });
          inCtx.resume().catch(function () {});
          var src = inCtx.createMediaStreamSource(stream);
          proc = inCtx.createScriptProcessor(2048, 1, 1);
          var mute = inCtx.createGain(); mute.gain.value = 0;
          src.connect(proc); proc.connect(mute); mute.connect(inCtx.destination);
          proc.onaudioprocess = function (ev) {
            var d = ev.inputBuffer.getChannelData(0), sum = 0;
            for (var i = 0; i < d.length; i += 4) sum += d[i] * d[i];
            micLevel = Math.min(1, Math.sqrt(sum / (d.length / 4)) * 6);
            if (!ready || !ws || ws.readyState !== 1) return;
            ws.send(JSON.stringify({ user_audio_chunk: pcm16Base64(d, inCtx.sampleRate) }));
          };
        };
        ws.onmessage = function (ev) {
          var m; try { m = JSON.parse(ev.data); } catch (e) { return; }
          if (m.type === "conversation_initiation_metadata") {
            var f = (m.conversation_initiation_metadata_event || {}).agent_output_audio_format || "pcm_16000";
            var r = /pcm_(\d+)/.exec(f); outRate = r ? Number(r[1]) : 16000;
            ready = true; if (h.onReady) h.onReady();
          }
          else if (m.type === "audio") { if (m.audio_event && m.audio_event.audio_base_64) play(m.audio_event.audio_base_64); }
          else if (m.type === "interruption") flush();
          else if (m.type === "ping") ws.send(JSON.stringify({ type: "pong", event_id: (m.ping_event || {}).event_id }));
          else if (m.type === "user_transcript") { var u = (m.user_transcription_event || {}).user_transcript; if (u && h.onLine) h.onLine("user", u); }
          else if (m.type === "agent_response") { var a = (m.agent_response_event || {}).agent_response; if (a && h.onLine) h.onLine("agent", a); }
          else if (m.type === "client_tool_call") {
            var c = m.client_tool_call || {};
            if (c.tool_name === "fin_appel_demo") {
              motif = (c.parameters && c.parameters.motif) || "fin";
              if (!finTimer) finTimer = setTimeout(finish, 5000);
            }
            if (c.expects_response) ws.send(JSON.stringify({ type: "client_tool_result", tool_call_id: c.tool_call_id, result: "ok", is_error: false }));
          }
        };
        ws.onerror = function () { if (!stopped) fail("Impossible de joindre le serveur vocal."); };
        ws.onclose = function (ev) {
          if (stopped) return;
          if (!ready) return fail("La connexion vocale a été fermée (" + ev.code + ").");
          finish();
        };
      }).catch(function (e) {
        fail(e && e.name && /NotAllowed|NotFound|NotReadable|Overconstrained/.test(e.name) ? micMessage(e) : (e && e.message) || "Erreur de connexion.");
      });
    },
    warn: function (texte) {
      if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type: "contextual_update", text: texte }));
    },
    stop: function () { teardown(); },
    /* niveaux 0..1 pour l'animation : voix de l'interlocuteur et micro */
    levels: function () {
      var out = 0;
      if (analyser && buf8) {
        analyser.getByteTimeDomainData(buf8);
        var s = 0; for (var i = 0; i < buf8.length; i++) { var x = (buf8[i] - 128) / 128; s += x * x; }
        out = Math.min(1, Math.sqrt(s / buf8.length) * 5);
      }
      return { out: out, mic: micLevel };
    }
  };
})();
