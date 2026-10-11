// 경기 목록과 경기 정보 입력 화면 (공통)

import { h } from './dom';
import { GAME_TYPES, GameType, PLACE_MAX_LENGTH, TEAM_NAME_MAX_LENGTH, Team, Venue } from './events';
import {
  GAME_TYPE_LABEL,
  Game,
  GameInfo,
  OPPONENT_MAX_LENGTH,
  VENUE_LABEL,
  dateLabel,
  defaultVenue,
  gameInfo,
  gameShortLabel,
  opponentLabel,
  orderLabel,
  ourTeamLabel,
  recentOpponents,
  recentPlaces,
  shiftDate,
  today,
} from './game';
import { GAME_CARD_LABEL, GAME_ORDER_LABEL, GAMES_VIEW_LABEL, IMPORT_LABEL } from './labels';
import { popup } from './popup';
import { CalendarState, calendarView } from './calendar-view';
import { segmented } from './dom';
import { GAME_ORDERS, GameOrder, GameTypeFilter, filterGames, sortGames } from './game-list';
import { GameReplay } from './replay';

export interface GameForm {
  /** 새 경기면 null */
  readonly gameId: string | null;
  readonly info: GameInfo;
  readonly error: string | null;
}

export interface GamesActions {
  select: (id: string) => void;
  /** 카드를 눌러 분석 "선택한 경기"에서 볼 경기로 고른다 */
  pick: (id: string) => void;
  openResult: (id: string) => void;
  /** 지울지 묻는 창을 연다 (null이면 닫기) */
  askDelete: (id: string | null) => void;
  confirmDelete: (id: string) => void;
  openNew: () => void;
  openEdit: (game: Game) => void;
  changeForm: (form: GameForm) => void;
  cancelForm: () => void;
  saveForm: (form: GameForm) => void;
  /** 설정 탭(데이터 관리)으로 가기 */
  openSettings: () => void;
  changeList: (list: GameListView) => void;
}

/** 경기 목록을 어떻게 보여줄지 (목록·달력, 정렬·찾기) */
export interface GameListView {
  readonly mode: 'list' | 'calendar';
  readonly order: GameOrder;
  readonly type: GameTypeFilter;
  readonly query: string;
  readonly calendar: CalendarState;
}


/** 버튼 여러 개 중 하나를 고르는 줄. 다시 그리지 않고 선택 표시만 바꾼다. show로 밖에서 고른 값을 표시할 수 있다. */
function picker<T extends string>(
  options: readonly [T, string][],
  selected: T,
  onSelect: (v: T) => void,
  className: string,
): { element: HTMLElement; show: (v: T) => void } {
  const buttons = options.map(([value, label]) =>
    h('button', { className: value === selected ? 'active' : '', text: label, attrs: { type: 'button', 'data-value': value } }),
  );
  const show = (v: T): void => buttons.forEach((x) => x.classList.toggle('active', x.dataset.value === v));
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      onSelect(b.dataset.value as T);
      show(b.dataset.value as T);
    }),
  );
  return { element: h('div', { className }, buttons), show };
}

function formView(form: GameForm, hasGames: boolean, opponents: readonly string[], places: readonly string[], actions: GamesActions): HTMLElement {
  // 입력할 때마다 다시 그리면 키보드가 닫히므로, 값은 그때그때 담아 두고 저장할 때 한 번에 쓴다.
  let current = form;
  const update = (info: Partial<GameInfo>): void => {
    current = { ...current, info: { ...current.info, ...info } };
    actions.changeForm(current);
  };

  const dateInput = h('input', { attrs: { id: 'game-date', type: 'date', value: form.info.date } });
  dateInput.addEventListener('input', () => update({ date: dateInput.value }));

  const opponentInput = h('input', {
    attrs: {
      id: 'game-opponent',
      type: 'text',
      value: form.info.opponent,
      placeholder: '예: 서울 ○○초',
      autocomplete: 'off',
      enterkeyhint: 'done',
      maxlength: String(OPPONENT_MAX_LENGTH),
    },
  });
  opponentInput.addEventListener('input', () => update({ opponent: opponentInput.value }));

  const placeInput = h('input', {
    attrs: {
      id: 'game-place',
      type: 'text',
      value: form.info.place,
      placeholder: '예: ○○초 운동장 (비워도 돼요)',
      autocomplete: 'off',
      enterkeyhint: 'done',
      maxlength: String(PLACE_MAX_LENGTH),
    },
  });
  placeInput.addEventListener('input', () => update({ place: placeInput.value }));

  // 우리 팀 이름은 설정에서 정한 값이 미리 들어 있어 보통은 손대지 않는다.
  const teamInput = h('input', {
    attrs: {
      id: 'game-our-team',
      type: 'text',
      value: form.info.ourTeam,
      placeholder: '우리 팀 (설정에서 정하면 자동으로 들어가요)',
      autocomplete: 'off',
      enterkeyhint: 'done',
      maxlength: String(TEAM_NAME_MAX_LENGTH),
    },
  });
  teamInput.addEventListener('input', () => update({ ourTeam: teamInput.value }));

  // 홈/원정은 선공/후공을 고르면 보통 짝(후공 = 홈)으로 맞춰 주고, 다르면 따로 바꾼다.
  const venuePicker = picker<Venue>(
    (['home', 'away'] as const).map((v) => [v, VENUE_LABEL[v]]),
    form.info.venue,
    (venue) => update({ venue }),
    'type-picker',
  );
  const orderPicker = picker<Team>(
    [
      ['us', '선공 (초에 공격)'],
      ['them', '후공 (말에 공격)'],
    ],
    form.info.battingFirst,
    (battingFirst) => {
      const venue = defaultVenue(battingFirst);
      update({ battingFirst, venue });
      venuePicker.show(venue);
    },
    'type-picker',
  );

  // 키보드를 열지 않아도 되게: 날짜는 오늘·어제를, 상대팀은 예전에 입력한 이름을 눌러 고른다.
  const todayText = today();
  const dateChips = quickChips(
    [
      [todayText, '오늘'],
      [shiftDate(todayText, -1), '어제'],
      [shiftDate(todayText, -2), '그제'],
    ],
    form.info.date,
    (date) => {
      dateInput.value = date;
      update({ date });
    },
  );
  const opponentChips =
    opponents.length > 0
      ? quickChips(
          opponents.map((name) => [name, name] as [string, string]),
          form.info.opponent.trim(),
          (name) => {
            opponentInput.value = name;
            update({ opponent: name });
          },
        )
      : null;
  const placeChips =
    places.length > 0
      ? quickChips(
          places.map((name) => [name, name] as [string, string]),
          form.info.place.trim(),
          (name) => {
            placeInput.value = name;
            update({ place: name });
          },
        )
      : null;

  return h('section', { className: 'game-form' }, [
    h('h2', { text: form.gameId ? '경기 정보 고치기' : '새 경기' }),
    hasGames ? null : h('p', { className: 'help', text: '먼저 오늘 경기 정보를 입력하세요. 나중에 고칠 수 있어요.' }),
    h('label', { attrs: { for: 'game-date' } }, ['날짜', dateInput]),
    dateChips,
    h('label', { attrs: { for: 'game-opponent' } }, ['상대팀', opponentInput]),
    opponentChips ? h('p', { className: 'help quick-help', text: '예전 상대팀을 누르면 바로 들어가요' }) : null,
    opponentChips,
    h('label', { attrs: { for: 'game-place' } }, ['장소', placeInput]),
    placeChips ? h('p', { className: 'help quick-help', text: '예전 장소를 누르면 바로 들어가요' }) : null,
    placeChips,
    h('div', { className: 'field' }, [
      h('span', { text: '경기 구분' }),
      picker<GameType>(GAME_TYPES.map((t) => [t, GAME_TYPE_LABEL[t]]), form.info.gameType, (t) => update({ gameType: t }), 'type-picker one-row').element,
    ]),
    h('div', { className: 'field' }, [h('span', { text: '우리 팀 공격 순서' }), orderPicker.element]),
    h('div', { className: 'field' }, [
      h('span', { text: '홈 / 원정' }),
      venuePicker.element,
      h('p', { className: 'help', text: '후공을 고르면 홈, 선공을 고르면 원정이 골라져요. 다르면 바꿔 주세요.' }),
    ]),
    h('label', { attrs: { for: 'game-our-team' } }, ['우리 팀', teamInput]),
    form.error ? h('p', { className: 'error', text: form.error, attrs: { role: 'alert' } }) : null,
    h('div', { className: 'confirm-buttons' }, [
      hasGames ? h('button', { className: 'secondary', text: '취소', onClick: actions.cancelForm }) : null,
      h('button', { className: 'primary', text: form.gameId ? '저장' : '경기 시작', onClick: () => actions.saveForm(current) }),
    ]),
    // 휴대폰을 바꾼 첫 화면에서도 예전 기록을 옮겨 올 수 있게 데이터 관리로 안내한다.
    hasGames
      ? null
      : h('div', { className: 'import-first' }, [
          h('p', { className: 'help', text: '예전에 내려받은 백업 파일이 있나요?' }),
          h('button', { className: 'secondary', onClick: actions.openSettings }, [
            h('strong', { text: `설정 › 데이터 관리에서 ${IMPORT_LABEL}` }),
            h('small', { text: '지금 기록은 지우지 않고 합칩니다' }),
          ]),
        ]),
  ]);
}

/** 누르면 입력 칸에 바로 들어가는 작은 단추 줄 */
function quickChips(options: readonly [string, string][], selected: string, onPick: (value: string) => void): HTMLElement {
  const buttons = options.map(([value, label]) =>
    h('button', { className: value === selected ? 'active' : '', text: label, attrs: { type: 'button', 'data-value': value } }),
  );
  buttons.forEach((b) =>
    b.addEventListener('click', () => {
      onPick(b.dataset.value ?? '');
      buttons.forEach((x) => x.classList.toggle('active', x === b));
    }),
  );
  return h('div', { className: 'quick-chips' }, buttons);
}

interface CardMarks {
  /** 지금 기록 중인 경기 */
  readonly current: boolean;
  /** 분석에서 볼 경기로 고른 경기 */
  readonly picked: boolean;
}

function gameCard(game: Game, marks: CardMarks, replay: GameReplay, summary: readonly string[], actions: GamesActions): HTMLElement {
  const label = GAME_CARD_LABEL;
  const info = gameInfo(game);
  const pitched = replay.plateAppearances.filter((pa) => pa.fieldingPosition === 'pitcher');
  const pitches = pitched.reduce((n, pa) => n + pa.pitches.length, 0);
  const batted = replay.plateAppearances.filter((pa) => pa.actor === 'child' && pa.outcome !== null).length;
  const card = h('article', { className: `game-card${marks.current ? ' current' : ''}${marks.picked ? ' picked' : ''}`, attrs: { 'aria-pressed': String(marks.picked) } }, [
    h('div', { className: 'game-card-head' }, [
      h('h3', { text: dateLabel(info.date) }),
      h('span', { className: 'game-card-chips' }, [
        marks.picked ? h('span', { className: 'type-chip picked', text: label.picked }) : null,
        replay.gameEnded ? h('span', { className: 'type-chip ended', text: '경기 끝' }) : null,
        h('span', { className: `type-chip ${info.gameType}`, text: GAME_TYPE_LABEL[info.gameType] }),
      ]),
    ]),
    h('p', { className: 'opponent', text: `${ourTeamLabel(info)} vs ${opponentLabel(info.opponent)} · ${orderLabel(info)}` }),
    info.place.trim() ? h('p', { className: 'sub', text: `장소: ${info.place.trim()}` }) : null,
    summary.length > 0 ? h('p', { className: 'game-summary' }, summary.flatMap((line, i) => (i === 0 ? [line] : [h('br'), line]))) : null,
    h('p', { className: 'sub', text: `장면 ${replay.scenes.length} · 투구 ${pitches}개 · 타석 ${batted}` }),
    game.copiedFrom ? h('p', { className: 'sub', text: '백업에서 불러온 사본 (같은 경기가 다르게 기록되어 있어 따로 만듦)' }) : null,
    h('div', { className: 'game-card-buttons' }, [
      h('button', { className: 'primary', text: label.result, onClick: () => actions.openResult(game.id) }),
      h('button', { className: 'secondary', text: marks.current ? label.resume : label.record, onClick: () => actions.select(game.id) }),
      h('button', { className: 'secondary', text: label.edit, onClick: () => actions.openEdit(game) }),
      h('button', { className: 'secondary danger', text: label.delete, onClick: () => actions.askDelete(game.id) }),
    ]),
  ]);
  // 카드의 빈 곳을 누르면 그 경기를 고른다. 카드 안 단추는 각자 할 일만 한다.
  card.addEventListener('click', (event) => {
    if (event.target instanceof Element && event.target.closest('button')) return;
    actions.pick(game.id);
  });
  return card;
}

/** 경기를 지우기 전에 한 번 더 묻는 창. 지우면 되돌릴 수 없다. (CLAUDE.md 2.8) */
function deletePopup(game: Game, actions: GamesActions): HTMLElement {
  const close = (): void => actions.askDelete(null);
  return popup('delete-popup', '경기 지우기', close, [
    h('p', { className: 'section-title', text: `${gameShortLabel(game)} 경기를 지울까요?` }),
    h('p', { className: 'help', text: '지우면 이 휴대폰에서 되돌릴 수 없어요. 전에 받아 둔 백업 파일에 있으면 "불러오기"로 되살릴 수 있어요.' }),
    h('div', { className: 'confirm-buttons' }, [
      h('button', { className: 'secondary', text: '취소', onClick: close }),
      h('button', { className: 'primary danger', text: '지우기', onClick: () => actions.confirmDelete(game.id) }),
    ]),
  ]);
}

/** 찾는 말은 칠 때마다 다시 그리면 키보드가 닫히므로, 목록 부분만 바꿔 그린다. */
function listControls(list: GameListView, onQuery: (query: string) => void, actions: GamesActions): HTMLElement {
  const search = h('input', {
    attrs: {
      id: 'game-search',
      type: 'search',
      value: list.query,
      placeholder: '상대팀 · 날짜(예: 10월) · 경기 구분',
      autocomplete: 'off',
      enterkeyhint: 'search',
      'aria-label': '경기 찾기',
    },
  });
  search.addEventListener('input', () => onQuery(search.value));
  const types: [GameTypeFilter, string][] = [['all', '전체'], ...GAME_TYPES.map((t): [GameTypeFilter, string] => [t, GAME_TYPE_LABEL[t]])];
  return h('div', { className: 'list-controls' }, [
    search,
    h(
      'div',
      { className: 'quick-chips', attrs: { role: 'group', 'aria-label': '경기 구분으로 거르기' } },
      types.map(([value, label]) =>
        h('button', { className: list.type === value ? 'active' : '', text: label, onClick: () => actions.changeList({ ...list, type: value }) }),
      ),
    ),
    h(
      'div',
      { className: 'order-picker', attrs: { role: 'group', 'aria-label': '정렬' } },
      GAME_ORDERS.map((order) =>
        h('button', { className: list.order === order ? 'active' : '', text: GAME_ORDER_LABEL[order], onClick: () => actions.changeList({ ...list, order }) }),
      ),
    ),
  ]);
}

function countText(total: number, shown: number): string {
  return shown === total ? `경기 ${total}개` : `경기 ${total}개 중 ${shown}개`;
}

export function gamesView(
  games: readonly Game[],
  currentGameId: string | null,
  pickedGameId: string | null,
  form: GameForm | null,
  list: GameListView,
  deletingId: string | null,
  actions: GamesActions,
  replayOf: (g: Game) => GameReplay,
  summaryOf: (games: readonly Game[]) => string[],
): HTMLElement {
  const deleting = games.find((g) => g.id === deletingId);
  const card = (g: Game): HTMLElement =>
    gameCard(g, { current: g.id === currentGameId, picked: g.id === pickedGameId }, replayOf(g), summaryOf([g]), actions);
  const modeTabs =
    games.length > 0
      ? segmented<GameListView['mode']>(
          [
            ['list', GAMES_VIEW_LABEL.list],
            ['calendar', GAMES_VIEW_LABEL.calendar],
          ],
          list.mode,
          (mode) => actions.changeList({ ...list, mode }),
          'kind-tabs',
        )
      : null;
  if (form) return formView(form, games.length > 0, recentOpponents(games), recentPlaces(games), actions);
  if (list.mode === 'calendar' && games.length > 0) {
    return h('section', { className: 'games' }, [
      h('button', { className: 'primary new-game', text: '+ 새 경기', onClick: actions.openNew }),
      modeTabs,
      calendarView(games, list.calendar, { change: (calendar) => actions.changeList({ ...list, calendar }) }, summaryOf, card),
      deleting ? deletePopup(deleting, actions) : null,
    ]);
  }
  const cards = h('div', { className: 'game-list', attrs: { 'aria-live': 'polite' } });
  const showList = (query: string): void => {
    const shown = sortGames(filterGames(games, query, list.type), list.order);
    cards.replaceChildren(
      h('p', { className: 'help list-count', text: `${countText(games.length, shown.length)} · 카드를 누르면 분석에서 그 경기를 봐요` }),
      ...shown.map(card),
    );
    if (shown.length === 0 && games.length > 0) cards.append(h('p', { className: 'empty', text: '찾는 경기가 없어요. 찾는 말이나 경기 구분을 바꿔 보세요.' }));
  };
  showList(list.query);
  return h('section', { className: 'games' }, [
    h('button', { className: 'primary new-game', text: '+ 새 경기', onClick: actions.openNew }),
    modeTabs,
    games.length > 0
      ? listControls(
          list,
          (query) => {
            actions.changeList({ ...list, query });
            showList(query);
          },
          actions,
        )
      : null,
    cards,
    deleting ? deletePopup(deleting, actions) : null,
  ]);
}
