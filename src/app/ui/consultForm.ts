/**
 * 상담 신청 — the form that closes the marketing scroll.
 *
 * There is no server behind this app, so the form does not pretend to send
 * anything. It validates, composes a clean summary, keeps a copy in the
 * browser, and hands the learner text they can paste into a message. Saying so
 * plainly is the honest version of a "제출 완료" screen.
 */

import { sfx } from '../core/audio';
import { h } from '../core/dom';
import { burstFrom } from '../core/motion';
import { CONTACT, TRACKS } from '../data/academy';
import { toast } from './components';

const GRADES = ['초 4', '초 5', '초 6', '중 1', '중 2', '중 3', '고 1', '고 2', '고 3', 'N수·기타'];
const TIMES = ['평일 오후', '평일 저녁', '토요일 오전', '토요일 오후', '아무 때나'];
const CONCERNS = [
  '독해 속도가 느립니다',
  '문학이 특히 약합니다',
  '문법 개념이 정리되지 않습니다',
  '글을 쓸 때 개요가 안 잡힙니다',
  '어휘력이 부족합니다',
  '공부 습관을 잡고 싶습니다',
];

const STORE_KEY = 'soo-korean:consult:v1';

interface Draft {
  name: string;
  grade: string;
  contact: string;
  track: string;
  time: string;
  concerns: string[];
  message: string;
  agreed: boolean;
}

function compose(d: Draft, ref: string): string {
  return [
    `[수 국어논술 상담 신청]`,
    `접수번호: ${ref}`,
    `학생: ${d.name} (${d.grade || '학년 미기재'})`,
    `연락처: ${d.contact}`,
    `관심 트랙: ${d.track || '미정 — 상담 후 결정'}`,
    `희망 시간: ${d.time || '미기재'}`,
    d.concerns.length ? `고민: ${d.concerns.join(', ')}` : null,
    d.message.trim() ? `남긴 말:\n${d.message.trim()}` : null,
  ]
    .filter(Boolean)
    .join('\n');
}

export function consultForm(): HTMLElement {
  const draft: Draft = {
    name: '',
    grade: '',
    contact: '',
    track: '',
    time: '',
    concerns: [],
    message: '',
    agreed: false,
  };

  const root = h('div.consult');
  const body = h('div');
  root.appendChild(body);

  const field = (label: string, control: HTMLElement, hint?: string) =>
    h(
      'div.consult__field',
      h('label.consult__label', label),
      control,
      hint ? h('div.consult__hint', hint) : null,
    );

  function chipGroup(
    options: string[],
    isOn: (v: string) => boolean,
    onPick: (v: string) => void,
  ): HTMLElement {
    const wrap = h('div.chips');
    const paint = () => {
      wrap.replaceChildren(
        ...options.map((o) =>
          h(
            `button.chip${isOn(o) ? '.is-on' : ''}`,
            {
              type: 'button',
              onclick: () => {
                sfx.tap();
                onPick(o);
                paint();
              },
            },
            o,
          ),
        ),
      );
    };
    paint();
    return wrap;
  }

  function renderForm(): void {
    body.replaceChildren();

    const nameInput = h('input.input', {
      type: 'text',
      placeholder: '학생 이름',
      autocomplete: 'name',
      oninput: (e: Event) => {
        draft.name = (e.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    const contactInput = h('input.input', {
      type: 'tel',
      inputmode: 'tel',
      placeholder: '연락 가능한 번호',
      autocomplete: 'tel',
      oninput: (e: Event) => {
        draft.contact = (e.target as HTMLInputElement).value;
      },
    }) as HTMLInputElement;

    const messageArea = h('textarea.textarea', {
      placeholder: '현재 상황이나 궁금한 점을 자유롭게 적어 주세요. (선택)',
      style: { minHeight: '110px' },
      oninput: (e: Event) => {
        draft.message = (e.target as HTMLTextAreaElement).value;
      },
    }) as HTMLTextAreaElement;

    const agreeBox = h('input', {
      type: 'checkbox',
      onchange: (e: Event) => {
        draft.agreed = (e.target as HTMLInputElement).checked;
      },
    }) as HTMLInputElement;

    const errorLine = h('div.consult__error');

    body.append(
      field('이름', nameInput),
      field(
        '학년',
        chipGroup(
          GRADES,
          (v) => draft.grade === v,
          (v) => {
            draft.grade = draft.grade === v ? '' : v;
          },
        ),
      ),
      field('연락처', contactInput, '상담 예약 확인 외의 용도로는 쓰지 않습니다.'),
      field(
        '관심 트랙',
        chipGroup(
          TRACKS.map((t) => t.name),
          (v) => draft.track === v,
          (v) => {
            draft.track = draft.track === v ? '' : v;
          },
        ),
        '아직 정하지 못했다면 비워 두셔도 됩니다.',
      ),
      field(
        '상담 희망 시간',
        chipGroup(
          TIMES,
          (v) => draft.time === v,
          (v) => {
            draft.time = draft.time === v ? '' : v;
          },
        ),
      ),
      field(
        '지금 가장 큰 고민',
        chipGroup(
          CONCERNS,
          (v) => draft.concerns.includes(v),
          (v) => {
            draft.concerns = draft.concerns.includes(v)
              ? draft.concerns.filter((x) => x !== v)
              : [...draft.concerns, v];
          },
        ),
        '여러 개를 고를 수 있습니다.',
      ),
      field('남기실 말', messageArea),
      h(
        'label.switch.consult__agree',
        agreeBox,
        h(
          'span',
          h('span.small', { style: { fontWeight: '700' } }, '개인정보 수집·이용에 동의합니다'),
          h(
            'div.tiny.muted',
            '이름·연락처·학년을 상담 예약 확인에만 사용합니다. 이 데모에서는 어디에도 전송되지 않고 브라우저에만 남습니다.',
          ),
        ),
      ),
      errorLine,
      h(
        'button.btn.btn--primary.btn--lg.btn--block',
        {
          type: 'button',
          style: { marginTop: '14px' },
          onclick: (e: MouseEvent) => {
            const problems: string[] = [];
            if (draft.name.trim().length < 2) problems.push('이름을 두 글자 이상 적어 주세요.');
            if (draft.contact.replace(/\D/g, '').length < 9) problems.push('연락처를 정확히 적어 주세요.');
            if (!draft.agreed) problems.push('개인정보 수집·이용 동의가 필요합니다.');
            if (problems.length) {
              errorLine.textContent = problems[0];
              errorLine.classList.add('is-on');
              sfx.wrong();
              return;
            }
            errorLine.classList.remove('is-on');
            sfx.done();
            burstFrom(e.currentTarget as HTMLElement, 45);
            submit();
          },
        },
        '상담 신청서 만들기',
      ),
    );
  }

  function submit(): void {
    const ref = `S${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const summary = compose(draft, ref);
    try {
      localStorage.setItem(STORE_KEY, JSON.stringify({ ...draft, ref, at: Date.now() }));
    } catch {
      /* private mode — the summary below still works */
    }

    body.replaceChildren(
      h(
        'div.consult__done',
        h('div.consult__seal', '接'),
        h('h3.h2', { style: { marginTop: '10px' } }, '신청서가 준비되었습니다'),
        h(
          'p.small.muted',
          { style: { marginTop: '8px' } },
          '이 앱에는 서버가 없어 자동으로 접수되지 않습니다. 아래 내용을 복사해 전화나 메일로 보내 주시면 확인 후 연락드립니다.',
        ),
        h(
          'div.consult__ref',
          h('span.tiny.muted', '접수번호'),
          h('b', ref),
        ),
        h('pre.consult__summary', summary),
        h(
          'div.row',
          { style: { marginTop: '14px' } },
          h(
            'button.btn.btn--primary',
            {
              type: 'button',
              onclick: () => {
                navigator.clipboard
                  ?.writeText(summary)
                  .then(() => toast('신청서를 복사했습니다', '📋'))
                  .catch(() => toast('복사에 실패했습니다. 직접 선택해 주세요', '⚠️'));
              },
            },
            '신청서 복사',
          ),
          h('a.btn.btn--ghost', { href: `tel:${CONTACT.phone.replace(/[^0-9+]/g, '')}` }, CONTACT.phone),
          h('a.btn.btn--ghost', { href: `mailto:${CONTACT.email}?subject=${encodeURIComponent(`상담 신청 ${ref}`)}&body=${encodeURIComponent(summary)}` }, '메일로 열기'),
        ),
        h(
          'button.btn.btn--ghost.btn--sm',
          {
            type: 'button',
            style: { marginTop: '12px' },
            onclick: () => {
              draft.name = '';
              draft.contact = '';
              draft.message = '';
              draft.concerns = [];
              draft.agreed = false;
              renderForm();
            },
          },
          '새로 작성하기',
        ),
      ),
    );
  }

  renderForm();
  return root;
}
