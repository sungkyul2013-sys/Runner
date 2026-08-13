/** Toast + consultation form. No backend: this is a front-end demo page. */

let toastTimer = 0;

export function toast(message: string): void {
  const el = document.getElementById('toast');
  if (!el) return;

  el.textContent = message;
  el.classList.add('is-up');

  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => el.classList.remove('is-up'), 3600);
}

export function initForm(): void {
  const form = document.getElementById('apply') as HTMLFormElement | null;
  if (!form) return;

  const phone = form.querySelector<HTMLInputElement>('#f-phone');

  // Light-touch phone formatting so the field feels native on mobile.
  phone?.addEventListener('input', () => {
    const digits = phone.value.replace(/\D/g, '').slice(0, 11);
    phone.value = digits
      .replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, '$1-$2-$3')
      .replace(/^(\d{2,3})(\d{1,4})$/, '$1-$2');
  });

  const markBad = (el: Element | null, bad: boolean): void => {
    el?.closest('.field, .check')?.classList.toggle('is-bad', bad);
  };

  form.querySelectorAll('input, select, textarea').forEach((el) => {
    el.addEventListener('input', () => markBad(el, false));
    el.addEventListener('change', () => markBad(el, false));
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name = form.querySelector<HTMLInputElement>('#f-name');
    const grade = form.querySelector<HTMLSelectElement>('#f-grade');
    const agree = form.querySelector<HTMLInputElement>('#f-agree');

    const problems: (HTMLElement | null)[] = [];
    if (!name?.value.trim()) problems.push(name);
    if ((phone?.value.replace(/\D/g, '').length ?? 0) < 9) problems.push(phone);
    if (!grade?.value) problems.push(grade);
    if (!agree?.checked) problems.push(agree);

    if (problems.length > 0) {
      problems.forEach((el) => markBad(el, true));
      problems[0]?.focus({ preventScroll: false });
      toast('필수 항목을 확인해 주세요.');
      return;
    }

    toast(`${name?.value.trim()} 학생 상담 신청이 접수되었습니다 (데모).`);
    form.reset();
    form.querySelectorAll('.is-bad').forEach((el) => el.classList.remove('is-bad'));
  });
}

/** FAQ: keep only one answer open at a time, the way a native list behaves. */
export function initFaq(): void {
  const items = Array.from(document.querySelectorAll<HTMLDetailsElement>('.faq__item'));
  for (const item of items) {
    item.addEventListener('toggle', () => {
      if (!item.open) return;
      for (const other of items) {
        if (other !== item) other.open = false;
      }
    });
  }
}
