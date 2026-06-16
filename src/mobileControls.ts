type MobileAction = (() => void) | null;

type MobileState = {
  x: number;
  y: number;
  moveTaps: number;
  action: MobileAction;
};

const DEADZONE = 0.16;

const state: MobileState = {
  x: 0,
  y: 0,
  moveTaps: 0,
  action: null,
};

let actionLabel: HTMLSpanElement | null = null;

const setStickIdle = (knob: HTMLElement) => {
  state.x = 0;
  state.y = 0;
  knob.style.transform = "translate(-50%, -50%)";
};

const setActionPressed = (button: HTMLElement, pressed: boolean) => {
  button.classList.toggle("is-pressed", pressed);
};

export const mobileControls = {
  setup() {
    if (typeof document === "undefined" || document.getElementById("mobile-controls")) {
      return;
    }

    const root = document.createElement("div");
    root.id = "mobile-controls";
    root.setAttribute("aria-label", "Touch controls");
    root.innerHTML = `
      <div class="mobile-stick" aria-label="Move">
        <div class="mobile-stick-ring">
          <div class="mobile-stick-knob"></div>
        </div>
      </div>
      <button class="mobile-action" type="button" aria-label="Action">
        <span>GO</span>
      </button>
    `;
    document.body.appendChild(root);

    const stick = root.querySelector<HTMLElement>(".mobile-stick");
    const knob = root.querySelector<HTMLElement>(".mobile-stick-knob");
    const button = root.querySelector<HTMLButtonElement>(".mobile-action");
    actionLabel = root.querySelector<HTMLSpanElement>(".mobile-action span");

    if (!stick || !knob || !button) return;
    root.addEventListener(
      "click",
      (event) => {
        event.preventDefault();
        event.stopPropagation();
      },
      { capture: true },
    );

    let activeStickPointer: number | null = null;

    const updateStick = (event: PointerEvent) => {
      const rect = stick.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      const maxDist = Math.max(32, rect.width * 0.34);
      const rawX = event.clientX - centerX;
      const rawY = event.clientY - centerY;
      const dist = Math.hypot(rawX, rawY);
      const scale = dist > maxDist ? maxDist / dist : 1;
      const x = rawX * scale;
      const y = rawY * scale;

      knob.style.transform = `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`;

      const nx = x / maxDist;
      const ny = y / maxDist;
      state.x = Math.abs(nx) >= DEADZONE ? nx : 0;
      state.y = Math.abs(ny) >= DEADZONE ? ny : 0;
    };

    stick.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      activeStickPointer = event.pointerId;
      stick.setPointerCapture(event.pointerId);
      state.moveTaps++;
      updateStick(event);
    });

    stick.addEventListener("pointermove", (event) => {
      if (event.pointerId !== activeStickPointer) return;
      event.preventDefault();
      event.stopPropagation();
      updateStick(event);
    });

    const endStick = (event: PointerEvent) => {
      if (event.pointerId !== activeStickPointer) return;
      event.preventDefault();
      event.stopPropagation();
      activeStickPointer = null;
      setStickIdle(knob);
    };

    stick.addEventListener("pointerup", endStick);
    stick.addEventListener("pointercancel", endStick);
    stick.addEventListener("lostpointercapture", () => {
      activeStickPointer = null;
      setStickIdle(knob);
    });

    button.addEventListener("pointerdown", (event) => {
      event.preventDefault();
      event.stopPropagation();
      button.setPointerCapture(event.pointerId);
      setActionPressed(button, true);
      state.action?.();
    });

    const releaseAction = (event: PointerEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setActionPressed(button, false);
    };

    button.addEventListener("pointerup", releaseAction);
    button.addEventListener("pointercancel", releaseAction);
    button.addEventListener("lostpointercapture", () => setActionPressed(button, false));

    root.addEventListener("contextmenu", (event) => event.preventDefault());
  },

  direction() {
    return { x: state.x, y: state.y };
  },

  consumeMoveTaps() {
    const taps = state.moveTaps;
    state.moveTaps = 0;
    return taps;
  },

  setAction(action: MobileAction, label = "GO") {
    state.action = action;
    if (actionLabel) actionLabel.textContent = label;
  },
};
