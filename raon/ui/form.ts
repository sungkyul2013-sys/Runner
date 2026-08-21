import { toast } from './motion';

/**
 * The consultation form.
 *
 * It validates and formats properly, then says plainly that nothing was
 * sent — this is a demo page, and a form that pretends to submit is worse
 * than one that admits it does not.
 */
export function initForm(): void {
  const form = document.getElementById('form') as HTMLFormElement | null;
  if (!form) return;

  const name = document.getElementById('fName') as HTMLInputElement;
  const phone = document.getElementById('fPhone') as HTMLInputElement;
  const grade = document.getElementById('fGrade') as HTMLSelectElement;
  const agree = document.getElementById('fAgree') as HTMLInputElement;

  const flag = (el: Element, bad: boolean): void => {
    el.closest('.field, .agree')?.classList.toggle('is-bad', bad);
  };

  for (const el of [name, phone, grade, agree]) {
    el.addEventListener('input', () => flag(el, false));
    el.addEventListener('change', () => flag(el, false));
  }

  // 010-0000-0000 as you type, without fighting the caret on deletion.
  phone.addEventListener('input', () => {
    const digits = phone.value.replace(/\D/g, '').slice(0, 11);
    const parts =
      digits.length > 7
        ? [digits.slice(0, 3), digits.slice(3, 7), digits.slice(7)]
        : digits.length > 3
          ? [digits.slice(0, 3), digits.slice(3)]
          : [digits];
    phone.value = parts.filter(Boolean).join('-');
  });

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const bad: HTMLElement[] = [];
    if (name.value.trim().length < 2) bad.push(name);
    if (phone.value.replace(/\D/g, '').length < 10) bad.push(phone);
    if (!grade.value) bad.push(grade);
    if (!agree.checked) bad.push(agree);

    for (const el of [name, phone, grade, agree]) flag(el, bad.includes(el));

    if (bad.length > 0) {
      bad[0].focus();
      toast('빈 칸을 채워 주세요.');
      return;
    }

    const who = name.value.trim();
    form.replaceChildren(
      Object.assign(document.createElement('div'), {
        className: 'form__done',
        innerHTML: `
          <span class="ok" aria-hidden="true">✓</span>
          <b>${who} 학생 신청이 접수되었습니다</b>
          <span>데모 페이지라 실제로 전송되지는 않았습니다. 실제 운영 시에는 이 자리에서 접수됩니다.</span>
        `,
      }),
    );
    toast('상담 신청이 접수되었습니다 (데모).');
  });
}
