// Admin panel: schema-driven UI bound straight to the CHEATS object.
// Opens from the main menu, the pause menu, or F1 while playing.
import { CHEATS, saveCheats, markUsed, ACTIONS, activeLabels } from '../game/cheats.js';

const SCHEMA = [
  {
    title: 'Joueur',
    items: [
      { k: 'god', label: 'Mode invincible', hint: 'Plus aucun dégât encaissé', hotkey: 'F2' },
      { k: 'noclip', label: 'Noclip', hint: 'Vol libre, traverse les murs', hotkey: 'F3' },
      { k: 'infiniteAmmo', label: 'Munitions infinies', hint: 'Chargeur toujours plein', hotkey: 'F7' },
      { k: 'oneShot', label: 'Élimination en un coup', hotkey: 'F8' },
      { k: 'noRecoil', label: 'Aucun recul' },
      { k: 'noSpread', label: 'Aucune dispersion', hint: 'Toutes les balles au réticule' },
      { k: 'speed', label: 'Vitesse', type: 'range', min: 0.5, max: 4, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
      { k: 'jump', label: 'Détente', type: 'range', min: 1, max: 3, step: 0.1, fmt: (v) => `${v.toFixed(1)}×` },
    ],
  },
  {
    title: 'Aimbot',
    path: 'aimbot',
    items: [
      { k: 'on', label: 'Activer l’aimbot', hotkey: 'F4' },
      { k: 'autoFire', label: 'Tir automatique', hint: 'Tire dès que la cible est verrouillée' },
      { k: 'throughWalls', label: 'Viser à travers les murs' },
      { k: 'keepOnTarget', label: 'Garder la cible' },
      { k: 'target', label: 'Point visé', type: 'choice', options: [['head', 'Tête'], ['chest', 'Torse']] },
      { k: 'fov', label: 'Cône de capture', type: 'range', min: 2, max: 180, step: 1, fmt: (v) => `${v}°` },
      { k: 'smooth', label: 'Réactivité', type: 'range', min: 1, max: 100, step: 1, fmt: (v) => (v >= 99 ? 'instantané' : String(v)) },
    ],
  },
  {
    title: 'ESP (vision murale)',
    path: 'esp',
    items: [
      { k: 'on', label: 'Activer l’ESP', hotkey: 'F5' },
      { k: 'boxes', label: 'Boîtes' },
      { k: 'names', label: 'Noms' },
      { k: 'health', label: 'Barres de vie' },
      { k: 'distance', label: 'Distance' },
      { k: 'skeleton', label: 'Squelette' },
      { k: 'tracers', label: 'Traceurs' },
      { k: 'allies', label: 'Inclure les alliés' },
      { k: 'radar', label: 'Radar complet', hint: 'Tous les ennemis sur la mini-carte' },
      { k: 'maxDist', label: 'Portée', type: 'range', min: 20, max: 200, step: 5, fmt: (v) => `${v} m` },
    ],
  },
  {
    title: 'Monde',
    items: [
      { k: 'freezeBots', label: 'Geler les bots', hotkey: 'F6' },
      { action: 'heal', label: 'Restaurer la santé' },
      { action: 'refill', label: 'Recharger tout' },
      { action: 'teleport', label: 'Téléportation au réticule', hint: 'Aussi sur [T]' },
      { action: 'killAll', label: 'Éliminer tous les ennemis' },
      { action: 'resetScore', label: 'Remettre le score à zéro' },
      { action: 'endMatch', label: 'Terminer le match' },
    ],
  },
];

export const HOTKEYS = {
  F2: ['god'], F3: ['noclip'], F4: ['aimbot', 'on'], F5: ['esp', 'on'],
  F6: ['freezeBots'], F7: ['infiniteAmmo'], F8: ['oneShot'],
};

export class AdminPanel {
  /** @param {object} ctx {getPlayer, getMatch, onClose, onOpen, toast} */
  constructor(ctx) {
    this.ctx = ctx;
    this.open = false;
    this.el = document.createElement('div');
    this.el.id = 'admin';
    this.el.className = 'hidden';
    this.el.innerHTML = `
      <div class="admin-box">
        <header>
          <h2>MOD ADMIN</h2>
          <label class="sw master"><input type="checkbox" id="admin-master"><span></span>Mod actif</label>
          <button id="admin-close">FERMER ✕</button>
        </header>
        <div class="admin-grid"></div>
        <footer>
          <span><kbd>F1</kbd> ouvrir/fermer · <kbd>F2</kbd> god · <kbd>F3</kbd> noclip ·
          <kbd>F4</kbd> aimbot · <kbd>F5</kbd> esp · <kbd>F6</kbd> geler · <kbd>T</kbd> téléport</span>
          <span id="admin-state"></span>
        </footer>
      </div>`;
    document.body.appendChild(this.el);

    this.grid = this.el.querySelector('.admin-grid');
    this.master = this.el.querySelector('#admin-master');
    this.stateEl = this.el.querySelector('#admin-state');
    this.controls = [];

    this.master.checked = CHEATS.enabled;
    this.master.onchange = () => { CHEATS.enabled = this.master.checked; this._changed(); };
    this.el.querySelector('#admin-close').onclick = () => this.hide();
    this.el.addEventListener('mousedown', (e) => e.stopPropagation());

    this._build();
  }

  _build() {
    for (const section of SCHEMA) {
      const box = document.createElement('section');
      box.innerHTML = `<h3>${section.title}</h3>`;
      for (const item of section.items) {
        const target = section.path ? CHEATS[section.path] : CHEATS;
        box.appendChild(this._control(item, target));
      }
      this.grid.appendChild(box);
    }
    this.sync();
  }

  _control(item, target) {
    const row = document.createElement('div');
    row.className = 'admin-row';

    if (item.action) {
      const b = document.createElement('button');
      b.className = 'admin-act';
      b.textContent = item.label;
      b.onclick = () => {
        const player = this.ctx.getPlayer(), match = this.ctx.getMatch();
        if (!player || !match) return this.ctx.toast?.('Aucun match en cours');
        ACTIONS[item.action]({ player, match });
        CHEATS.used = true;
        this.ctx.toast?.(item.label);
      };
      row.appendChild(b);
      if (item.hint) {
        const h = document.createElement('small');
        h.textContent = item.hint;
        row.appendChild(h);
      }
      return row;
    }

    if (item.type === 'range') {
      const lab = document.createElement('label');
      lab.className = 'admin-range';
      lab.innerHTML = `<span>${item.label}</span>`;
      const input = document.createElement('input');
      input.type = 'range';
      input.min = item.min; input.max = item.max; input.step = item.step;
      const out = document.createElement('output');
      input.oninput = () => {
        target[item.k] = Number(input.value);
        out.textContent = item.fmt ? item.fmt(target[item.k]) : input.value;
        this._changed();
      };
      lab.appendChild(input);
      lab.appendChild(out);
      row.appendChild(lab);
      this.controls.push({ item, target, input, out });
      return row;
    }

    if (item.type === 'choice') {
      const lab = document.createElement('div');
      lab.className = 'admin-choice';
      lab.innerHTML = `<span>${item.label}</span>`;
      const wrap = document.createElement('div');
      for (const [val, text] of item.options) {
        const b = document.createElement('button');
        b.textContent = text;
        b.dataset.val = val;
        b.onclick = () => { target[item.k] = val; this._changed(); this.sync(); };
        wrap.appendChild(b);
      }
      lab.appendChild(wrap);
      row.appendChild(lab);
      this.controls.push({ item, target, wrap });
      return row;
    }

    // toggle
    const lab = document.createElement('label');
    lab.className = 'sw';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.onchange = () => { target[item.k] = input.checked; this._changed(); };
    const knob = document.createElement('span');
    lab.appendChild(input);
    lab.appendChild(knob);
    lab.appendChild(document.createTextNode(item.label));
    if (item.hotkey) {
      const kb = document.createElement('kbd');
      kb.textContent = item.hotkey;
      lab.appendChild(kb);
    }
    row.appendChild(lab);
    if (item.hint) {
      const h = document.createElement('small');
      h.textContent = item.hint;
      row.appendChild(h);
    }
    this.controls.push({ item, target, input });
    return row;
  }

  _changed() {
    markUsed();
    saveCheats();
    this.sync();
  }

  /** Push the CHEATS state back into every widget (hotkeys change it too). */
  sync() {
    this.master.checked = CHEATS.enabled;
    this.el.classList.toggle('off', !CHEATS.enabled);
    for (const c of this.controls) {
      const v = c.target[c.item.k];
      if (c.input && c.input.type === 'checkbox') c.input.checked = !!v;
      else if (c.input) { c.input.value = v; c.out.textContent = c.item.fmt ? c.item.fmt(v) : String(v); }
      else if (c.wrap) {
        for (const b of c.wrap.children) b.classList.toggle('sel', b.dataset.val === v);
      }
    }
    const labels = activeLabels();
    this.stateEl.textContent = labels.length ? labels.join(' · ') : 'aucune option active';
  }

  show() {
    this.open = true;
    this.el.classList.remove('hidden');
    this.sync();
    this.ctx.onOpen?.();
  }

  hide() {
    this.open = false;
    this.el.classList.add('hidden');
    this.ctx.onClose?.();
  }

  toggle() { this.open ? this.hide() : this.show(); }

  /** Handle a hotkey; returns true when it was consumed. */
  hotkey(code) {
    if (code === 'F1') { this.toggle(); return true; }
    const path = HOTKEYS[code];
    if (!path) return false;
    if (!CHEATS.enabled) CHEATS.enabled = true;
    const target = path.length > 1 ? CHEATS[path[0]] : CHEATS;
    const key = path[path.length - 1];
    target[key] = !target[key];
    this._changed();
    const name = { god: 'MODE INVINCIBLE', noclip: 'NOCLIP', on: path[0] === 'aimbot' ? 'AIMBOT' : 'ESP',
      freezeBots: 'BOTS GELÉS', infiniteAmmo: 'MUNITIONS INFINIES', oneShot: 'ONE SHOT' }[key];
    this.ctx.toast?.(`${name} ${target[key] ? 'ON' : 'OFF'}`);
    return true;
  }
}
