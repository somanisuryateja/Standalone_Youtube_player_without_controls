/*!
 * Clean YouTube Player — a brand-free YouTube embed.
 *
 * Hides the YouTube logo, video title, share/watch-later buttons, native
 * controls and end-screen recommendations, then provides its own controls.
 * The video is still streamed by YouTube's free CDN.
 *
 * Usage:
 *   const player = new CleanYouTubePlayer(document.querySelector('#el'), {
 *     videoId: 'aqz-KE-bpKQ',   // or use { url: 'https://youtu.be/...' }
 *     accent: '#6d28d9',        // optional brand color
 *   });
 *
 * NOTE: This is not DRM. A determined user can still find the source video ID
 * via browser devtools. For paid/secure content use Cloudflare Stream / Vimeo
 * Pro with signed URLs.
 */
(function (global) {
  "use strict";

  var SPEEDS = [1, 1.25, 1.5, 2];
  var apiPromise = null;

  function loadApi() {
    if (global.YT && global.YT.Player) return Promise.resolve(global.YT);
    if (apiPromise) return apiPromise;
    apiPromise = new Promise(function (resolve, reject) {
      var prev = global.onYouTubeIframeAPIReady;
      global.onYouTubeIframeAPIReady = function () {
        if (typeof prev === "function") prev();
        resolve(global.YT);
      };
      var tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      tag.onerror = function () { reject(new Error("Failed to load YouTube API")); };
      document.head.appendChild(tag);
    });
    return apiPromise;
  }

  function extractId(input) {
    if (!input) return "";
    var m = String(input).match(
      /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/)|youtu\.be\/)([\w-]{11})/
    );
    if (m) return m[1];
    if (/^[\w-]{11}$/.test(input)) return input; // already an ID
    return "";
  }

  function fmt(t) {
    if (!isFinite(t) || t < 0) t = 0;
    var m = Math.floor(t / 60);
    var s = Math.floor(t % 60);
    return m + ":" + (s < 10 ? "0" + s : s);
  }

  var ICONS = {
    play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
    pause: '<svg viewBox="0 0 24 24"><path d="M6 5h4v14H6zM14 5h4v14h-4z"/></svg>',
    volume: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13.5 2a4.5 4.5 0 00-2.5-4v8a4.5 4.5 0 002.5-4z"/></svg>',
    mute: '<svg viewBox="0 0 24 24"><path d="M3 10v4h4l5 5V5L7 10H3zm13 .7L14.3 12 16 13.7 14.6 15 13 13.4 11.4 15 10 13.7 11.7 12 10 10.3 11.4 9 13 10.6 14.6 9z"/></svg>',
    full: '<svg viewBox="0 0 24 24"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>',
    speed: '<svg viewBox="0 0 24 24"><path d="M12 4a8 8 0 108 8h-2a6 6 0 11-6-6V4z"/><path d="M13 7h-2v6l5 3 1-1.7-4-2.3z"/></svg>',
    replay: '<svg viewBox="0 0 24 24"><path d="M12 5V1L7 6l5 5V7a5 5 0 11-5 5H5a7 7 0 107-7z"/></svg>',
  };

  function el(tag, cls, html) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (html != null) node.innerHTML = html;
    return node;
  }

  function CleanYouTubePlayer(container, options) {
    if (!container) throw new Error("CleanYouTubePlayer: container is required");
    options = options || {};
    this.videoId = extractId(options.videoId || options.url || "");
    if (!this.videoId) throw new Error("CleanYouTubePlayer: a valid videoId or url is required");

    this.container = container;
    this.player = null;
    this.poll = null;
    this.ready = false;
    this.playing = false;
    this.duration = 0;
    this.speedIdx = 0;
    this.muted = false;

    this._build(options.accent);
    this._init();
  }

  CleanYouTubePlayer.prototype._build = function (accent) {
    var c = this.container;
    c.classList.add("cyp", "is-paused");
    if (accent) c.style.setProperty("--cyp-accent", accent);
    c.innerHTML = "";

    this.mount = el("div", "cyp__mount");

    var poster = el("button", "cyp__poster");
    poster.type = "button";
    poster.setAttribute("aria-label", "Play video");
    var img = el("img");
    img.alt = "";
    img.src = "https://i.ytimg.com/vi/" + this.videoId + "/maxresdefault.jpg";
    var self = this;
    img.onerror = function () { img.src = "https://i.ytimg.com/vi/" + self.videoId + "/hqdefault.jpg"; };
    poster.appendChild(img);
    poster.appendChild(el("span", "cyp__bigplay", ICONS.play));
    this.poster = poster;

    var click = el("button", "cyp__click");
    click.type = "button";
    click.setAttribute("aria-label", "Play/pause");
    this.click = click;

    var ended = el("div", "cyp__ended");
    var replay = el("button", "cyp__replay", ICONS.replay + "<span>Replay</span>");
    replay.type = "button";
    ended.appendChild(el("p", null, "Video finished"));
    ended.appendChild(replay);
    this.replay = replay;

    var error = el("div", "cyp__error", "This video can't be played.");

    // Control bar
    var bar = el("div", "cyp__bar");
    var seek = el("input", "cyp__range cyp__seek");
    seek.type = "range"; seek.min = 0; seek.max = 0; seek.step = 0.1; seek.value = 0;
    seek.setAttribute("aria-label", "Seek");
    this.seek = seek;

    var row = el("div", "cyp__row");
    this.playBtn = mkBtn("Play/pause", ICONS.play);
    this.muteBtn = mkBtn("Mute", ICONS.volume);
    var vol = el("input", "cyp__range cyp__vol");
    vol.type = "range"; vol.min = 0; vol.max = 100; vol.value = 100;
    vol.setAttribute("aria-label", "Volume");
    this.vol = vol;
    this.time = el("span", "cyp__time", "0:00 / 0:00");
    var spacer = el("div", "cyp__spacer");
    this.speedBtn = el("button", "cyp__speed", ICONS.speed + "<span>1x</span>");
    this.speedBtn.type = "button";
    this.fullBtn = mkBtn("Fullscreen", ICONS.full);

    row.appendChild(this.playBtn);
    row.appendChild(this.muteBtn);
    row.appendChild(vol);
    row.appendChild(this.time);
    row.appendChild(spacer);
    row.appendChild(this.speedBtn);
    row.appendChild(this.fullBtn);

    bar.appendChild(seek);
    bar.appendChild(row);

    c.appendChild(this.mount);
    c.appendChild(click);
    c.appendChild(poster);
    c.appendChild(ended);
    c.appendChild(error);
    c.appendChild(bar);

    // Events
    poster.addEventListener("click", function () { self.toggle(); });
    click.addEventListener("click", function () { self.toggle(); });
    this.playBtn.addEventListener("click", function () { self.toggle(); });
    replay.addEventListener("click", function () { self.toggle(); });
    this.muteBtn.addEventListener("click", function () { self.toggleMute(); });
    vol.addEventListener("input", function () { self._onVolume(); });
    seek.addEventListener("input", function () { self._onSeek(); });
    this.speedBtn.addEventListener("click", function () { self._cycleSpeed(); });
    this.fullBtn.addEventListener("click", function () { self._fullscreen(); });

    function mkBtn(label, icon) {
      var b = el("button", "cyp__btn", icon);
      b.type = "button";
      b.setAttribute("aria-label", label);
      return b;
    }
  };

  CleanYouTubePlayer.prototype._init = function () {
    var self = this;
    loadApi()
      .then(function (YT) {
        var host = document.createElement("div");
        self.mount.appendChild(host);
        self.player = new YT.Player(host, {
          host: "https://www.youtube-nocookie.com",
          videoId: self.videoId,
          playerVars: {
            controls: 0, modestbranding: 1, rel: 0, iv_load_policy: 3,
            disablekb: 1, fs: 0, playsinline: 1, enablejsapi: 1,
            origin: global.location ? global.location.origin : undefined,
          },
          events: {
            onReady: function (e) {
              self.ready = true;
              self.duration = e.target.getDuration() || 0;
              self.seek.max = self.duration;
              self._renderTime();
            },
            onStateChange: function (e) {
              var S = YT.PlayerState;
              if (e.data === S.PLAYING) self._setPlaying(true);
              else if (e.data === S.PAUSED) self._setPlaying(false);
              else if (e.data === S.ENDED) self._setEnded();
            },
            onError: function () { self.container.classList.add("is-error"); },
          },
        });
      })
      .catch(function () { self.container.classList.add("is-error"); });
  };

  CleanYouTubePlayer.prototype._setPlaying = function (on) {
    this.playing = on;
    this.container.classList.toggle("is-paused", !on);
    this.container.classList.remove("is-ended");
    this.playBtn.innerHTML = on ? ICONS.pause : ICONS.play;
    if (on) this._startPoll(); else this._stopPoll();
  };

  CleanYouTubePlayer.prototype._setEnded = function () {
    this.playing = false;
    this.container.classList.add("is-ended");
    this.container.classList.remove("is-paused");
    this._stopPoll();
  };

  CleanYouTubePlayer.prototype._startPoll = function () {
    var self = this;
    this._stopPoll();
    this.poll = setInterval(function () {
      if (!self.player || !self.player.getCurrentTime) return;
      var t = self.player.getCurrentTime() || 0;
      self.seek.value = t;
      var d = self.player.getDuration ? self.player.getDuration() : 0;
      if (d && d !== self.duration) { self.duration = d; self.seek.max = d; }
      self._renderTime();
    }, 250);
  };

  CleanYouTubePlayer.prototype._stopPoll = function () {
    if (this.poll) clearInterval(this.poll);
    this.poll = null;
  };

  CleanYouTubePlayer.prototype._renderTime = function () {
    this.time.textContent = fmt(Number(this.seek.value)) + " / " + fmt(this.duration);
  };

  CleanYouTubePlayer.prototype.toggle = function () {
    var p = this.player;
    if (!this.ready || !p || typeof p.playVideo !== "function") return;
    if (this.container.classList.contains("is-ended")) {
      p.seekTo(0, true); p.playVideo(); return;
    }
    if (this.playing) p.pauseVideo(); else p.playVideo();
  };

  CleanYouTubePlayer.prototype.toggleMute = function () {
    var p = this.player;
    if (!this.ready || !p) return;
    if (this.muted) { p.unMute(); this.muted = false; this.muteBtn.innerHTML = ICONS.volume; }
    else { p.mute(); this.muted = true; this.muteBtn.innerHTML = ICONS.mute; }
  };

  CleanYouTubePlayer.prototype._onVolume = function () {
    var v = Number(this.vol.value);
    var p = this.player;
    if (!this.ready || !p) return;
    p.setVolume(v);
    if (v === 0) { p.mute(); this.muted = true; this.muteBtn.innerHTML = ICONS.mute; }
    else if (this.muted) { p.unMute(); this.muted = false; this.muteBtn.innerHTML = ICONS.volume; }
  };

  CleanYouTubePlayer.prototype._onSeek = function () {
    var t = Number(this.seek.value);
    this._renderTime();
    if (this.player && this.player.seekTo) this.player.seekTo(t, true);
  };

  CleanYouTubePlayer.prototype._cycleSpeed = function () {
    this.speedIdx = (this.speedIdx + 1) % SPEEDS.length;
    var s = SPEEDS[this.speedIdx];
    this.speedBtn.querySelector("span").textContent = s + "x";
    if (this.player && this.player.setPlaybackRate) this.player.setPlaybackRate(s);
  };

  CleanYouTubePlayer.prototype._fullscreen = function () {
    var el = this.container;
    if (document.fullscreenElement) document.exitFullscreen();
    else if (el.requestFullscreen) el.requestFullscreen();
  };

  CleanYouTubePlayer.prototype.destroy = function () {
    this._stopPoll();
    try { if (this.player && this.player.destroy) this.player.destroy(); } catch (e) { /* noop */ }
    this.player = null;
    this.container.innerHTML = "";
    this.container.classList.remove("cyp", "is-paused", "is-ended", "is-error");
  };

  CleanYouTubePlayer.extractId = extractId;

  if (typeof module !== "undefined" && module.exports) module.exports = CleanYouTubePlayer;
  global.CleanYouTubePlayer = CleanYouTubePlayer;
})(typeof window !== "undefined" ? window : this);
