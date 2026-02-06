import type { BookAdventureEngine, GameEvent } from '../engine';
import type { StoryNode } from '../types';
import { getUIStrings, type UIStrings } from './translations';

/**
 * Book Adventure UI Renderer
 * Handles all DOM manipulation for the game UI
 */
export class BookAdventureRenderer {
  private engine: BookAdventureEngine;
  private currentResultText: string | null = null;
  private t: UIStrings;

  // DOM Elements
  private elements: {
    gameTitle: HTMLElement | null;
    chapterHeader: HTMLElement | null;
    chapterLabel: HTMLElement | null;
    chapterTitle: HTMLElement | null;
    narrative: HTMLElement | null;
    result: HTMLElement | null;
    status: HTMLElement | null;
    inventoryItems: HTMLElement | null;
    variables: HTMLElement | null;
    actions: HTMLElement | null;
    actionsSection: HTMLElement | null;
    saveBtn: HTMLButtonElement | null;
    loadBtn: HTMLButtonElement | null;
    menuBtn: HTMLButtonElement | null;
    progressText: HTMLElement | null;
    progressFill: HTMLElement | null;
    modalOverlay: HTMLElement | null;
    modal: HTMLElement | null;
    modalTitle: HTMLElement | null;
    saveForm: HTMLElement | null;
    loadForm: HTMLElement | null;
    menuForm: HTMLElement | null;
    saveNameInput: HTMLInputElement | null;
    saveList: HTMLElement | null;
  };

  constructor(engine: BookAdventureEngine) {
    this.engine = engine;
    this.t = getUIStrings(engine.getMeta().language);
    this.elements = this.getElements();
    this.translateStaticUI();
    this.bindEvents();
    this.subscribeToEngine();
  }

  /**
   * Get all DOM elements
   */
  private getElements() {
    return {
      gameTitle: document.getElementById('game-title'),
      chapterHeader: document.getElementById('chapter-header'),
      chapterLabel: document.getElementById('chapter-label'),
      chapterTitle: document.getElementById('chapter-title'),
      narrative: document.getElementById('narrative'),
      result: document.getElementById('result'),
      status: document.getElementById('status'),
      inventoryItems: document.getElementById('inventory-items'),
      variables: document.getElementById('variables'),
      actions: document.getElementById('actions'),
      actionsSection: document.getElementById('actions-section'),
      saveBtn: document.getElementById('btn-save') as HTMLButtonElement,
      loadBtn: document.getElementById('btn-load') as HTMLButtonElement,
      menuBtn: document.getElementById('btn-menu') as HTMLButtonElement,
      progressText: document.getElementById('progress-text'),
      progressFill: document.getElementById('progress-fill'),
      modalOverlay: document.getElementById('modal-overlay'),
      modal: document.getElementById('modal'),
      modalTitle: document.getElementById('modal-title'),
      saveForm: document.getElementById('save-form'),
      loadForm: document.getElementById('load-form'),
      menuForm: document.getElementById('menu-form'),
      saveNameInput: document.getElementById('save-name-input') as HTMLInputElement,
      saveList: document.getElementById('save-list'),
    };
  }

  /**
   * Translate static UI elements that are set in HTML
   */
  private translateStaticUI(): void {
    // Header buttons
    if (this.elements.saveBtn) {
      this.elements.saveBtn.textContent = this.t.save;
      this.elements.saveBtn.title = this.t.saveGame;
    }
    if (this.elements.loadBtn) {
      this.elements.loadBtn.textContent = this.t.load;
      this.elements.loadBtn.title = this.t.loadGame;
    }
    if (this.elements.menuBtn) {
      this.elements.menuBtn.title = this.t.menu;
    }

    // Inventory label
    const inventoryLabel = document.querySelector('.book-adventure__inventory-label');
    if (inventoryLabel) {
      inventoryLabel.textContent = this.t.carrying;
    }
    if (this.elements.inventoryItems) {
      this.elements.inventoryItems.textContent = this.t.nothingOfNote;
    }

    // Loading text
    if (this.elements.narrative) {
      this.elements.narrative.innerHTML = `<p>${this.t.loading}</p>`;
    }

    // Save form input placeholder
    if (this.elements.saveNameInput) {
      this.elements.saveNameInput.placeholder = this.t.enterSaveName;
    }

    // Modal buttons
    const cancelSaveBtn = document.getElementById('btn-cancel-save');
    if (cancelSaveBtn) cancelSaveBtn.textContent = this.t.cancel;

    const confirmSaveBtn = document.getElementById('btn-confirm-save');
    if (confirmSaveBtn) confirmSaveBtn.textContent = this.t.save;

    const cancelLoadBtn = document.getElementById('btn-cancel-load');
    if (cancelLoadBtn) cancelLoadBtn.textContent = this.t.cancel;

    // Menu buttons
    const menuSaveBtn = document.getElementById('btn-menu-save');
    if (menuSaveBtn) menuSaveBtn.textContent = this.t.saveGame;

    const menuLoadBtn = document.getElementById('btn-menu-load');
    if (menuLoadBtn) menuLoadBtn.textContent = this.t.loadGame;

    const menuRestartBtn = document.getElementById('btn-menu-restart');
    if (menuRestartBtn) menuRestartBtn.textContent = this.t.restart;

    const menuCloseBtn = document.getElementById('btn-menu-close');
    if (menuCloseBtn) menuCloseBtn.textContent = this.t.close;
  }

  /**
   * Bind UI events
   */
  private bindEvents(): void {
    // Header controls
    this.elements.saveBtn?.addEventListener('click', () => this.openSaveModal());
    this.elements.loadBtn?.addEventListener('click', () => this.openLoadModal());
    this.elements.menuBtn?.addEventListener('click', () => this.openMenuModal());

    // Modal controls
    document.getElementById('btn-cancel-save')?.addEventListener('click', () => this.closeModal());
    document.getElementById('btn-confirm-save')?.addEventListener('click', () => this.handleSave());
    document.getElementById('btn-cancel-load')?.addEventListener('click', () => this.closeModal());

    // Menu controls
    document.getElementById('btn-menu-save')?.addEventListener('click', () => this.openSaveModal());
    document.getElementById('btn-menu-load')?.addEventListener('click', () => this.openLoadModal());
    document.getElementById('btn-menu-restart')?.addEventListener('click', () => this.handleRestart());
    document.getElementById('btn-menu-close')?.addEventListener('click', () => this.closeModal());

    // Close modal on overlay click
    this.elements.modalOverlay?.addEventListener('click', (e) => {
      if (e.target === this.elements.modalOverlay) {
        this.closeModal();
      }
    });

    // Keyboard shortcuts
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModal();
      }
    });
  }

  /**
   * Subscribe to engine events
   */
  private subscribeToEngine(): void {
    this.engine.on((event: GameEvent) => {
      switch (event.type) {
        case 'game_started':
        case 'game_loaded':
        case 'node_changed':
          this.currentResultText = null;
          this.render();
          this.scrollToTop();
          break;

        case 'interaction_result':
          this.currentResultText = event.resultText ?? null;
          this.render();
          break;

        case 'state_changed':
          this.renderStatus();
          this.renderActions();
          break;

        case 'game_ended':
          this.renderEnding(event.node as StoryNode);
          break;
      }
    });
  }

  /**
   * Full render of the current game state
   */
  private render(): void {
    const node = this.engine.getCurrentNode();
    if (!node) return;

    this.renderChapter(node);
    this.renderNarrative(node);
    this.renderResult();
    this.renderStatus();
    this.renderActions();
    this.renderProgress();
  }

  /**
   * Scroll to top so the player sees the new text
   */
  private scrollToTop(): void {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /**
   * Render chapter header
   */
  private renderChapter(node: StoryNode): void {
    const chapterInfo = this.engine.getChapterInfo();

    if (chapterInfo && this.elements.chapterHeader) {
      this.elements.chapterHeader.style.display = '';
      if (this.elements.chapterLabel) {
        this.elements.chapterLabel.textContent = `${this.t.chapter} ${chapterInfo.number}`;
      }
      if (this.elements.chapterTitle) {
        this.elements.chapterTitle.textContent = chapterInfo.title;
      }
    } else if (node.title && this.elements.chapterHeader) {
      this.elements.chapterHeader.style.display = '';
      if (this.elements.chapterLabel) {
        this.elements.chapterLabel.textContent = '';
      }
      if (this.elements.chapterTitle) {
        this.elements.chapterTitle.textContent = node.title;
      }
    } else if (this.elements.chapterHeader) {
      this.elements.chapterHeader.style.display = 'none';
    }
  }

  /**
   * Render narrative content
   */
  private renderNarrative(node: StoryNode): void {
    if (!this.elements.narrative) return;

    // Convert content to paragraphs if it contains line breaks
    const content = node.content;
    const paragraphs = content.split(/\n\n+/).filter((p) => p.trim());

    if (paragraphs.length > 1) {
      this.elements.narrative.innerHTML = paragraphs.map((p) => `<p>${this.escapeHtml(p.trim())}</p>`).join('');
    } else {
      this.elements.narrative.innerHTML = `<p>${this.escapeHtml(content)}</p>`;
    }
  }

  /**
   * Render result text (after interaction)
   */
  private renderResult(): void {
    if (!this.elements.result) return;

    if (this.currentResultText) {
      this.elements.result.textContent = this.currentResultText;
      this.elements.result.style.display = '';
    } else {
      this.elements.result.style.display = 'none';
    }
  }

  /**
   * Render inventory and variables
   */
  private renderStatus(): void {
    // Inventory
    if (this.elements.inventoryItems) {
      const items = this.engine.getInventoryItems();
      if (items.length === 0) {
        this.elements.inventoryItems.textContent = this.t.nothingOfNote;
        this.elements.inventoryItems.classList.add('book-adventure__inventory-empty');
      } else {
        const itemNames = items.map((item) => item.name);
        this.elements.inventoryItems.textContent = this.formatList(itemNames);
        this.elements.inventoryItems.classList.remove('book-adventure__inventory-empty');
      }
    }

    // Variables
    if (this.elements.variables) {
      const vars = this.engine.getVariableDisplay();
      if (vars.length > 0) {
        this.elements.variables.innerHTML = vars
          .map(
            (v) =>
              `<span class="book-adventure__variable">
                <span class="book-adventure__variable-name">${this.escapeHtml(v.displayName)}:</span> ${v.value}
              </span>`
          )
          .join('');
        this.elements.variables.style.display = '';
      } else {
        this.elements.variables.style.display = 'none';
      }
    }

    // Hide status if empty
    if (this.elements.status) {
      const items = this.engine.getInventoryItems();
      const vars = this.engine.getVariableDisplay();
      this.elements.status.style.display = items.length === 0 && vars.length === 0 ? 'none' : '';
    }
  }


  /**
   * Render action buttons
   */
  private renderActions(): void {
    if (!this.elements.actions) return;

    const interactions = this.engine.getAvailableInteractions();

    if (interactions.length === 0) {
      if (this.elements.actionsSection) {
        this.elements.actionsSection.style.display = 'none';
      }
      return;
    }

    if (this.elements.actionsSection) {
      this.elements.actionsSection.style.display = '';
    }

    // Sort interactions by type for better organization
    const sortOrder: Record<string, number> = {
      story: 0,
      talk: 1,
      ask: 2,
      examine: 3,
      take: 4,
      use: 5,
      use_on: 6,
      combine: 7,
      give: 8,
      go: 9,
    };

    const sorted = [...interactions].sort((a, b) => {
      return (sortOrder[a.type] ?? 99) - (sortOrder[b.type] ?? 99);
    });

    this.elements.actions.innerHTML = sorted
      .map((interaction) => {
        const typeClass = `book-adventure__action--${interaction.type}`;
        return `
          <button
            class="book-adventure__action ${typeClass}"
            data-interaction-id="${interaction.id}"
          >
            ${this.escapeHtml(interaction.buttonText)}
          </button>
        `;
      })
      .join('');

    // Bind click events
    this.elements.actions.querySelectorAll('.book-adventure__action').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const interactionId = (e.currentTarget as HTMLElement).dataset.interactionId;
        if (interactionId) {
          this.engine.executeInteraction(interactionId);
        }
      });
    });
  }

  /**
   * Render progress indicator
   */
  private renderProgress(): void {
    const chapterInfo = this.engine.getChapterInfo();
    const progress = this.engine.getProgress();

    if (this.elements.progressText) {
      if (chapterInfo) {
        this.elements.progressText.textContent = this.t.chapterOf
          .replace('{number}', String(chapterInfo.number))
          .replace('{total}', String(chapterInfo.total));
      } else {
        this.elements.progressText.textContent = this.t.explored
          .replace('{percent}', String(progress));
      }
    }

    if (this.elements.progressFill) {
      this.elements.progressFill.style.width = `${progress}%`;
    }
  }

  /**
   * Render ending screen
   */
  private renderEnding(node: StoryNode): void {
    if (!this.elements.narrative) return;

    this.elements.narrative.innerHTML = `
      <div class="book-adventure__ending">
        <div class="book-adventure__ending-label">${this.escapeHtml(this.t.theEnd)}</div>
        <h2 class="book-adventure__ending-title">${this.escapeHtml(node.title)}</h2>
        <div class="book-adventure__ending-divider">&#10087;</div>
        <div class="book-adventure__narrative">
          ${node.content
            .split(/\n\n+/)
            .map((p) => `<p>${this.escapeHtml(p.trim())}</p>`)
            .join('')}
        </div>
        <div class="book-adventure__ending-actions">
          <button class="book-adventure__btn" id="btn-ending-restart">${this.escapeHtml(this.t.playAgain)}</button>
        </div>
      </div>
    `;

    // Hide other elements
    if (this.elements.status) this.elements.status.style.display = 'none';
    if (this.elements.actionsSection) this.elements.actionsSection.style.display = 'none';
    if (this.elements.result) this.elements.result.style.display = 'none';
    if (this.elements.chapterHeader) this.elements.chapterHeader.style.display = 'none';

    // Bind restart button
    document.getElementById('btn-ending-restart')?.addEventListener('click', () => this.handleRestart());

    this.scrollToTop();
  }

  /**
   * Handle restart
   */
  private handleRestart(): void {
    if (confirm(this.t.confirmRestart)) {
      this.closeModal();
      this.engine.start();
    }
  }

  /**
   * Open save modal
   */
  private openSaveModal(): void {
    if (this.elements.modalTitle) this.elements.modalTitle.textContent = this.t.saveGame;
    if (this.elements.saveForm) this.elements.saveForm.style.display = '';
    if (this.elements.loadForm) this.elements.loadForm.style.display = 'none';
    if (this.elements.menuForm) this.elements.menuForm.style.display = 'none';
    if (this.elements.saveNameInput) {
      this.elements.saveNameInput.value = '';
      this.elements.saveNameInput.placeholder = `${this.t.save} ${new Date().toLocaleDateString()}`;
    }
    this.elements.modalOverlay?.classList.add('book-adventure__modal-overlay--open');
    this.elements.saveNameInput?.focus();
  }

  /**
   * Open load modal
   */
  private openLoadModal(): void {
    if (this.elements.modalTitle) this.elements.modalTitle.textContent = this.t.loadGame;
    if (this.elements.saveForm) this.elements.saveForm.style.display = 'none';
    if (this.elements.loadForm) this.elements.loadForm.style.display = '';
    if (this.elements.menuForm) this.elements.menuForm.style.display = 'none';
    this.renderSaveList();
    this.elements.modalOverlay?.classList.add('book-adventure__modal-overlay--open');
  }

  /**
   * Open menu modal
   */
  private openMenuModal(): void {
    if (this.elements.modalTitle) this.elements.modalTitle.textContent = this.t.menu;
    if (this.elements.saveForm) this.elements.saveForm.style.display = 'none';
    if (this.elements.loadForm) this.elements.loadForm.style.display = 'none';
    if (this.elements.menuForm) this.elements.menuForm.style.display = '';
    this.elements.modalOverlay?.classList.add('book-adventure__modal-overlay--open');
  }

  /**
   * Close modal
   */
  private closeModal(): void {
    this.elements.modalOverlay?.classList.remove('book-adventure__modal-overlay--open');
  }

  /**
   * Handle save
   */
  private handleSave(): void {
    const saveName = this.elements.saveNameInput?.value.trim() || `${this.t.save} ${new Date().toLocaleDateString()}`;
    this.engine.save(saveName);
    this.closeModal();
  }

  /**
   * Render save list for load modal
   */
  private renderSaveList(): void {
    if (!this.elements.saveList) return;

    const saves = this.engine.getSaves();

    if (saves.length === 0) {
      this.elements.saveList.innerHTML = `<li style="text-align: center; padding: 20px; color: var(--color-text-muted);">${this.escapeHtml(this.t.noSavedGames)}</li>`;
      return;
    }

    this.elements.saveList.innerHTML = saves
      .map(
        (save) => `
        <li class="book-adventure__save-item" data-save-id="${save.id}">
          <div>
            <div class="book-adventure__save-name">${this.escapeHtml(save.saveName)}</div>
            <div class="book-adventure__save-date">${new Date(save.updatedAt).toLocaleString()}</div>
          </div>
          <button class="book-adventure__save-delete" data-save-id="${save.id}" title="Delete">&#10005;</button>
        </li>
      `
      )
      .join('');

    // Bind click events
    this.elements.saveList.querySelectorAll('.book-adventure__save-item').forEach((item) => {
      item.addEventListener('click', (e) => {
        // Don't trigger if clicking delete button
        if ((e.target as HTMLElement).classList.contains('book-adventure__save-delete')) return;

        const saveId = (item as HTMLElement).dataset.saveId;
        if (saveId) {
          this.engine.load(saveId);
          this.closeModal();
        }
      });
    });

    // Bind delete buttons
    this.elements.saveList.querySelectorAll('.book-adventure__save-delete').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const saveId = (btn as HTMLElement).dataset.saveId;
        if (saveId && confirm(this.t.confirmDelete)) {
          this.engine.deleteSave(saveId);
          this.renderSaveList();
        }
      });
    });
  }

  /**
   * Format a list of items in natural language
   */
  private formatList(items: string[]): string {
    if (items.length === 0) return '';
    if (items.length === 1) return items[0];
    if (items.length === 2) return `${items[0]} ${this.t.and} ${items[1]}`;
    return `${items.slice(0, -1).join(', ')}, ${this.t.and} ${items[items.length - 1]}`;
  }

  /**
   * Escape HTML to prevent XSS
   */
  private escapeHtml(text: string): string {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}
