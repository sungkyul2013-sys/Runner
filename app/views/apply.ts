import { h, icon, qs } from '../core/dom';
import type { Router } from '../core/router';
import { buzz, toast } from '../core/ui';
import { store } from '../core/store';
import { GRADES } from '../data/content';
import { DOMAINS } from '../data/questions';

/**
 * 상담 신청 — pre-filled from whatever the visitor has already done in the
 * app. Someone who just finished a diagnosis should not have to retype
 * their grade or explain their weak area.
 *
 * The form is separated from the page around it so the guided programme
 * can finish inside its own flow rather than handing off to another screen.
 */
export function consultForm(onSent?: () => void): HTMLFormElement {
  const run = store.lastRun;
  const plan = store.get().plan;

  const weakest = run
    ? DOMAINS.map((d) => ({
        d,
        r: run.byDomain[d] ? run.byDomain[d].correct / Math.max(1, run.byDomain[d].total) : 1,
      })).sort((a, b) => a.r - b.r)[0].d
    : null;

  const prefill = [
    run ? `진단 ${Math.round((run.score / run.total) * 100)}점 (보완: ${weakest})` : '',
    plan ? `플랜: ${plan.grade} · ${plan.goal} · 주 ${plan.perWeek}회` : '',
  ]
    .filter(Boolean)
    .join('\n');

  const field = (
    id: string,
    label: string,
    input: HTMLElement,
  ): HTMLElement => h('label', { class: 'formfield', for: id }, h('span', { text: label }), input);

  const name = h('input', {
    id: 'f-name',
    type: 'text',
    autocomplete: 'name',
    placeholder: '학생 이름',
    required: true,
  });

  const phone = h('input', {
    id: 'f-phone',
    type: 'tel',
    inputmode: 'numeric',
    autocomplete: 'tel',
    placeholder: '010-0000-0000',
    required: true,
  });

  phone.addEventListener('input', () => {
    const digits = phone.value.replace(/\D/g, '').slice(0, 11);
    phone.value = digits
      .replace(/^(\d{2,3})(\d{3,4})(\d{4})$/, '$1-$2-$3')
      .replace(/^(\d{2,3})(\d{1,4})$/, '$1-$2');
  });

  const gradeSel = h(
    'select',
    { id: 'f-grade', required: true },
    h('option', { value: '', disabled: true, selected: !plan }, '학년 선택'),
    ...GRADES.map((g) => h('option', { selected: plan?.grade === g }, g)),
  );

  const memo = h('textarea', {
    id: 'f-memo',
    rows: '4',
    placeholder: '궁금한 점 (선택)',
    text: prefill,
  });

  const agree = h('input', { id: 'f-agree', type: 'checkbox', required: true });

  const form = h(
    'form',
    { class: 'card', novalidate: true },
    h('h2', { class: 'h3', text: '무료 진단 상담 신청' }),
    h('p', { class: 'sm', style: { marginBottom: '18px' }, text: '영업일 기준 1일 이내에 연락드립니다.' }),
    field('f-name', '학생 이름', name),
    field('f-phone', '연락처', phone),
    field('f-grade', '학년', gradeSel),
    field('f-memo', '남기실 말씀', memo),
    h(
      'label',
      { class: 'check' },
      agree,
      h('span', { text: '상담을 위한 개인정보 수집·이용에 동의합니다.' }),
    ),
    h('button', { class: 'btn btn--primary btn--block', type: 'submit' }, '신청 보내기'),
    h('p', {
      class: 'sm',
      style: { marginTop: '12px', textAlign: 'center' },
      text: '데모 사이트입니다. 입력값은 전송되지 않고 화면에서만 확인됩니다.',
    }),
  );

  const flag = (el: Element, bad: boolean): void => {
    el.closest('.formfield, .check')?.classList.toggle('is-bad', bad);
  };

  for (const el of [name, phone, gradeSel, agree]) {
    el.addEventListener('input', () => flag(el, false));
    el.addEventListener('change', () => flag(el, false));
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const bad: HTMLElement[] = [];
    if (!name.value.trim()) bad.push(name);
    if (phone.value.replace(/\D/g, '').length < 9) bad.push(phone);
    if (!gradeSel.value) bad.push(gradeSel);
    if (!agree.checked) bad.push(agree);

    if (bad.length > 0) {
      bad.forEach((el) => flag(el, true));
      bad[0].focus();
      buzz([24, 60, 24]);
      toast('필수 항목을 확인해 주세요.', 'bad');
      return;
    }

    buzz(16);
    toast(`${name.value.trim()} 학생 신청이 접수되었습니다 (데모).`, 'good');
    form.reset();
    qs('.is-bad', form)?.classList.remove('is-bad');
    onSent?.();
  });

  return form;
}

export function applyView(router: Router): HTMLElement {
  const run = store.lastRun;
  const plan = store.get().plan;

  const weakest = run
    ? DOMAINS.map((d) => ({
        d,
        r: run.byDomain[d] ? run.byDomain[d].correct / Math.max(1, run.byDomain[d].total) : 1,
      })).sort((a, b) => a.r - b.r)[0].d
    : null;

  const prefill = [
    run ? `진단 ${Math.round((run.score / run.total) * 100)}점 (보완: ${weakest})` : '',
    plan ? `플랜: ${plan.grade} · ${plan.goal} · 주 ${plan.perWeek}회` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return h(
    'div',
    { class: 'wrap stack--lg stack' },

    h(
      'header',
      { class: 'stack', style: { gap: '10px' } },
      h('span', { class: 'eyebrow', text: '상담' }),
      h('h1', { class: 'h1' }, '문 앞까지가 가장 ', h('span', { class: 'pen', text: '어려운' }), ' 한 걸음.'),
    ),

    prefill
      ? h(
          'section',
          { class: 'card card--solid' },
          h('span', { class: 'eyebrow', text: '이미 남긴 기록' }),
          h('p', { class: 'body', style: { whiteSpace: 'pre-line', marginTop: '8px' }, text: prefill }),
          h('p', { class: 'sm', text: '상담 메모에 자동으로 넣어 두었습니다.' }),
        )
      : h(
          'section',
          { class: 'card card--solid' },
          h('p', { class: 'body', text: '진단 결과가 있으면 상담이 훨씬 빨라집니다. 12문항, 약 8분입니다.' }),
          h(
            'button',
            {
              class: 'btn btn--ghost',
              style: { marginTop: '14px' },
              on: { click: () => router.go('/quiz') },
            },
            '먼저 진단하기',
            icon('arrow', 17),
          ),
        ),

    consultForm(),

    h(
      'section',
      { class: 'card' },
      h('h2', { class: 'h3', text: '오시는 길' }),
      h(
        'dl',
        { class: 'info' },
        h('div', {}, h('dt', { text: '주소' }), h('dd', { text: '서울특별시 ○○구 ○○로 00, 3층' })),
        h(
          'div',
          {},
          h('dt', { text: '전화' }),
          h('dd', {}, h('a', { href: 'tel:0200000000', text: '02-000-0000' })),
        ),
        h('div', {}, h('dt', { text: '상담 시간' }), h('dd', { text: '평일 14:00–22:00 · 토 10:00–18:00' })),
      ),
      h(
        'a',
        { class: 'btn btn--ghost btn--block', href: 'tel:0200000000', style: { marginTop: '16px' } },
        '전화로 상담하기',
      ),
    ),
  );
}
