const mascot = document.getElementById('pip');
const reduced = matchMedia('(prefers-reduced-motion: reduce)');
const stops = [...document.querySelectorAll('[data-stop]')];
let current = stops[0];
let movement;

current.append(mascot);

export function moveMascot(stop) {
  const target = stops.find((item) => item.dataset.stop === stop);
  if (!target || target === current) return;
  const from = mascot.getBoundingClientRect();
  movement?.cancel();
  target.append(mascot);
  current = target;
  if (reduced.matches) return;
  const to = mascot.getBoundingClientRect();
  const x = from.left - to.left;
  const y = from.top - to.top;
  const near = Math.hypot(x, y) < Math.min(window.innerHeight * .85, 700);
  if (!near || to.bottom < 0 || to.top > innerHeight) {
    movement = mascot.animate(
      [{ transform: 'translateY(5px) rotate(-8deg)' }, { transform: 'translateY(0) rotate(0)' }],
      { duration: 350, easing: 'cubic-bezier(.2,.8,.2,1)' },
    );
    return;
  }

  for (const fraction of [.2, .39, .58, .78]) {
    const print = document.createElement('span');
    print.className = 'mascot-print';
    print.setAttribute('aria-hidden', 'true');
    print.style.left = `${to.left + to.width / 2 + x * fraction}px`;
    print.style.top = `${to.top + to.height / 2 + y * fraction}px`;
    document.body.append(print);
    const fading = print.animate([{ opacity: .6 }, { opacity: 0 }], { duration: 530, easing: 'ease-out' });
    fading.finished.then(() => print.remove(), () => print.remove());
  }
  movement = mascot.animate([
    { transform: `translate(${x}px, ${y}px) rotate(-8deg)` },
    { transform: `translate(${x * .48}px, ${y * .48 - 9}px) rotate(8deg)`, offset: .49 },
    { transform: 'translate(0, 0) rotate(0)' },
  ], { duration: 470, easing: 'cubic-bezier(.2,.7,.2,1)' });
}

let scheduled = false;
addEventListener('scroll', () => {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(() => {
    scheduled = false;
    const threshold = Math.min(340, innerHeight * .45);
    let active = stops[0];
    for (const stop of stops) {
      if (stop.getBoundingClientRect().top <= threshold) active = stop;
    }
    moveMascot(active.dataset.stop);
  });
}, { passive: true });
