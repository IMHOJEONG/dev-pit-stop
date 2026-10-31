import { ITEMS, ITEM_IDS, CATEGORY_NAMES } from '../items/catalog';
import type { ItemCategory, ItemId } from '../items/catalog';
import type { ItemSystem, ItemUseResult } from '../items/item-system';
import { icon } from './icons';
export class InventoryPanel {
  private category: ItemCategory | 'all' = 'all';
  private selected: ItemId;
  private query = '';
  private sort = 'category';
  private stamina: number;
  private abort = new AbortController();
  constructor(
    private root: HTMLElement,
    private items: ItemSystem,
    stamina: number,
    private use: (item: ItemId) => ItemUseResult,
  ) {
    this.stamina = stamina;
    this.selected = ITEM_IDS.find((id) => items.count(id) > 0) ?? 'berry';
    root.innerHTML = `<div class="bag-summary"><p>작은 발견을 모아, 더 먼 곳으로.</p><span id="bag-total"></span></div><div class="bag-controls"><label class="bag-search">아이템 검색<input id="bag-search" type="search" placeholder="이름으로 찾기" autocomplete="off"></label><label class="bag-sort">정렬<select id="bag-sort"><option value="category">종류순</option><option value="amount">수량순</option><option value="name">이름순</option></select></label></div><div class="bag-filters" aria-label="아이템 종류">${(['all', 'consumable', 'material', 'collectible'] as const).map((id) => `<button data-category="${id}" aria-pressed="${id === 'all'}">${id === 'all' ? '전체' : CATEGORY_NAMES[id]}</button>`).join('')}</div><div class="bag-layout"><div><div id="bag-grid" class="bag-grid" aria-label="보관한 아이템"></div><p id="bag-empty" class="bag-empty" hidden>찾는 아이템이 없어요. 다른 이름이나 종류를 골라보세요.</p></div><aside id="bag-detail" class="bag-detail" aria-label="아이템 상세"></aside></div><p id="bag-feedback" class="bag-feedback" role="status" aria-live="polite"></p><p class="bag-note">같은 아이템은 수량으로 모아 보관해요. 바닥에 떨어진 아이템은 가까이에서 <kbd>E</kbd>로 줍고, <kbd>B</kbd>로 배낭을 열 수 있어요.</p>`;
    root.addEventListener(
      'click',
      (event) => {
        const target = (event.target as Element).closest<HTMLButtonElement>('button');
        if (!target) return;
        if (target.dataset.category) {
          this.category = target.dataset.category as ItemCategory | 'all';
          this.render();
        }
        if (target.dataset.item) {
          this.selected = target.dataset.item as ItemId;
          this.render();
        }
        if (target.dataset.use) {
          const result = this.use(this.selected);
          this.stamina = result.stamina;
          this.render();
          this.root.querySelector('#bag-feedback')!.textContent = result.message;
        }
      },
      { signal: this.abort.signal },
    );
    root.querySelector<HTMLInputElement>('#bag-search')!.addEventListener(
      'input',
      (event) => {
        this.query = (event.target as HTMLInputElement).value;
        this.render();
      },
      { signal: this.abort.signal },
    );
    root.querySelector<HTMLSelectElement>('#bag-sort')!.addEventListener(
      'change',
      (event) => {
        this.sort = (event.target as HTMLSelectElement).value;
        this.render();
      },
      { signal: this.abort.signal },
    );
    this.render();
  }
  private render() {
    const visible = ITEM_IDS.filter(
      (id) =>
        (this.category === 'all' || ITEMS[id].category === this.category) &&
        ITEMS[id].name.includes(this.query.trim()),
    );
    visible.sort((a, b) =>
      this.sort === 'amount'
        ? this.items.count(b) - this.items.count(a) ||
          ITEMS[a].name.localeCompare(ITEMS[b].name, 'ko')
        : this.sort === 'name'
          ? ITEMS[a].name.localeCompare(ITEMS[b].name, 'ko')
          : { consumable: 0, material: 1, collectible: 2 }[ITEMS[a].category] -
              { consumable: 0, material: 1, collectible: 2 }[ITEMS[b].category] ||
            Number(this.items.count(b) > 0) - Number(this.items.count(a) > 0),
    );
    if (!visible.includes(this.selected) && visible.length) this.selected = visible[0];
    const totals = this.items.totals();
    this.root.querySelector('#bag-total')!.textContent =
      `${totals.kinds}종 · 총 ${totals.amount}개`;
    this.root
      .querySelectorAll<HTMLButtonElement>('[data-category]')
      .forEach((button) =>
        button.setAttribute('aria-pressed', String(button.dataset.category === this.category)),
      );
    this.root.querySelector('#bag-grid')!.innerHTML = visible
      .map(
        (id) =>
          `<button class="bag-card ${this.items.count(id) === 0 ? 'is-empty' : ''}" data-item="${id}" aria-pressed="${id === this.selected}" aria-label="${ITEMS[id].name} ${this.items.count(id)}개"><span class="bag-item-icon" data-kind="${id}">${icon(id)}</span><span><strong>${ITEMS[id].name}</strong><small>${CATEGORY_NAMES[ITEMS[id].category]}</small></span><b>×${this.items.count(id)}</b></button>`,
      )
      .join('');
    (this.root.querySelector('#bag-empty') as HTMLElement).hidden = visible.length > 0;
    const detail = this.root.querySelector<HTMLElement>('#bag-detail')!;
    if (!visible.length) {
      detail.hidden = true;
      return;
    }
    detail.hidden = false;
    const item = ITEMS[this.selected],
      amount = this.items.count(this.selected),
      consumable = item.stamina !== undefined;
    detail.innerHTML = `<span class="bag-detail-icon bag-item-icon" data-kind="${this.selected}">${icon(this.selected)}</span><span class="bag-category">${CATEGORY_NAMES[item.category]}</span><h3>${item.name}</h3><p>${item.description}</p><div class="bag-owned"><span>보유 수량</span><strong>${amount}개</strong></div><small class="bag-source">${item.source}</small>${consumable ? `<div class="bag-energy"><span>스태미나</span><b>${Math.round(this.stamina)} / 100</b></div><button class="primary-button bag-use" data-use="${this.selected}" ${amount < 1 || this.stamina >= 100 ? 'disabled' : ''}>먹기 · 스태미나 +${item.stamina}</button><small>${amount < 1 ? '열매를 발견하면 배낭에서 먹을 수 있어요.' : this.stamina >= 100 ? '스태미나가 가득 차 있어요.' : '달리느라 지쳤을 때 사용해 보세요.'}</small>` : `<div class="bag-storage-note">${item.category === 'collectible' ? '소모되지 않는 수집품으로 보관됩니다.' : this.selected === 'ironOre' ? '철광석은 제작 재료로 모아둘 수 있어요. 현재 관측소와 상승기는 목재·돌·수정을 사용합니다.' : '관측소와 상승기 제작에 필요한 만큼 사용됩니다.'}</div>`}`;
  }
  dispose() {
    this.abort.abort();
  }
}
