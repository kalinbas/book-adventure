/**
 * UI Translations
 *
 * Provides translated UI strings based on the game's language.
 * The language comes from gameData.meta.language (e.g., "English", "German", "French").
 */

export interface UIStrings {
  // Header buttons
  save: string;
  load: string;
  menu: string;

  // Save/Load modal
  saveGame: string;
  loadGame: string;
  cancel: string;
  close: string;
  restart: string;
  enterSaveName: string;
  noSavedGames: string;
  deleteSave: string;

  // Game UI
  chapter: string; // "Chapter"
  chapterOf: string; // "Chapter {number} of {total}" — use {number} and {total}
  explored: string; // "{percent}% explored" — use {percent}
  theEnd: string;
  playAgain: string;
  carrying: string; // "You are carrying:"
  nothingOfNote: string;
  loading: string;
  failedToLoad: string;

  // Confirm dialogs
  confirmRestart: string;
  confirmDelete: string;

  // List conjunction
  and: string;
}

const english: UIStrings = {
  save: 'Save',
  load: 'Load',
  menu: 'Menu',
  saveGame: 'Save Game',
  loadGame: 'Load Game',
  cancel: 'Cancel',
  close: 'Close',
  restart: 'Restart',
  enterSaveName: 'Enter save name...',
  noSavedGames: 'No saved games found',
  deleteSave: 'Delete this save?',
  chapter: 'Chapter',
  chapterOf: 'Chapter {number} of {total}',
  explored: '{percent}% explored',
  theEnd: 'The End',
  playAgain: 'Play Again',
  carrying: 'You are carrying:',
  nothingOfNote: 'nothing of note',
  loading: 'Loading...',
  failedToLoad: 'Failed to load game data. Please check the console for errors.',
  confirmRestart: 'Are you sure you want to restart? Your progress will be lost unless saved.',
  confirmDelete: 'Delete this save?',
  and: 'and',
};

const german: UIStrings = {
  save: 'Speichern',
  load: 'Laden',
  menu: 'Menü',
  saveGame: 'Spiel speichern',
  loadGame: 'Spiel laden',
  cancel: 'Abbrechen',
  close: 'Schließen',
  restart: 'Neustart',
  enterSaveName: 'Spielstand benennen...',
  noSavedGames: 'Keine Spielstände gefunden',
  deleteSave: 'Diesen Spielstand löschen?',
  chapter: 'Kapitel',
  chapterOf: 'Kapitel {number} von {total}',
  explored: '{percent}% erkundet',
  theEnd: 'Ende',
  playAgain: 'Nochmal spielen',
  carrying: 'Du trägst bei dir:',
  nothingOfNote: 'nichts Besonderes',
  loading: 'Laden...',
  failedToLoad: 'Spieldaten konnten nicht geladen werden. Bitte überprüfe die Konsole.',
  confirmRestart: 'Möchtest du wirklich neu starten? Dein Fortschritt geht verloren, wenn du nicht gespeichert hast.',
  confirmDelete: 'Diesen Spielstand löschen?',
  and: 'und',
};

const french: UIStrings = {
  save: 'Sauver',
  load: 'Charger',
  menu: 'Menu',
  saveGame: 'Sauvegarder',
  loadGame: 'Charger une partie',
  cancel: 'Annuler',
  close: 'Fermer',
  restart: 'Recommencer',
  enterSaveName: 'Nom de la sauvegarde...',
  noSavedGames: 'Aucune sauvegarde trouvée',
  deleteSave: 'Supprimer cette sauvegarde ?',
  chapter: 'Chapitre',
  chapterOf: 'Chapitre {number} sur {total}',
  explored: '{percent}% exploré',
  theEnd: 'Fin',
  playAgain: 'Rejouer',
  carrying: 'Vous portez :',
  nothingOfNote: 'rien de particulier',
  loading: 'Chargement...',
  failedToLoad: 'Impossible de charger les données du jeu. Veuillez vérifier la console.',
  confirmRestart: 'Êtes-vous sûr de vouloir recommencer ? Votre progression sera perdue si vous n\'avez pas sauvegardé.',
  confirmDelete: 'Supprimer cette sauvegarde ?',
  and: 'et',
};

const spanish: UIStrings = {
  save: 'Guardar',
  load: 'Cargar',
  menu: 'Menú',
  saveGame: 'Guardar partida',
  loadGame: 'Cargar partida',
  cancel: 'Cancelar',
  close: 'Cerrar',
  restart: 'Reiniciar',
  enterSaveName: 'Nombre de la partida...',
  noSavedGames: 'No se encontraron partidas guardadas',
  deleteSave: '¿Eliminar esta partida?',
  chapter: 'Capítulo',
  chapterOf: 'Capítulo {number} de {total}',
  explored: '{percent}% explorado',
  theEnd: 'Fin',
  playAgain: 'Jugar de nuevo',
  carrying: 'Llevas contigo:',
  nothingOfNote: 'nada destacable',
  loading: 'Cargando...',
  failedToLoad: 'No se pudieron cargar los datos del juego. Revisa la consola para más detalles.',
  confirmRestart: '¿Seguro que quieres reiniciar? Tu progreso se perderá si no has guardado.',
  confirmDelete: '¿Eliminar esta partida?',
  and: 'y',
};

const italian: UIStrings = {
  save: 'Salva',
  load: 'Carica',
  menu: 'Menu',
  saveGame: 'Salva partita',
  loadGame: 'Carica partita',
  cancel: 'Annulla',
  close: 'Chiudi',
  restart: 'Ricomincia',
  enterSaveName: 'Nome del salvataggio...',
  noSavedGames: 'Nessun salvataggio trovato',
  deleteSave: 'Eliminare questo salvataggio?',
  chapter: 'Capitolo',
  chapterOf: 'Capitolo {number} di {total}',
  explored: '{percent}% esplorato',
  theEnd: 'Fine',
  playAgain: 'Gioca ancora',
  carrying: 'Stai portando:',
  nothingOfNote: 'niente di particolare',
  loading: 'Caricamento...',
  failedToLoad: 'Impossibile caricare i dati del gioco. Controlla la console per errori.',
  confirmRestart: 'Sei sicuro di voler ricominciare? I tuoi progressi andranno persi se non hai salvato.',
  confirmDelete: 'Eliminare questo salvataggio?',
  and: 'e',
};

const portuguese: UIStrings = {
  save: 'Salvar',
  load: 'Carregar',
  menu: 'Menu',
  saveGame: 'Salvar jogo',
  loadGame: 'Carregar jogo',
  cancel: 'Cancelar',
  close: 'Fechar',
  restart: 'Recomeçar',
  enterSaveName: 'Nome do salvamento...',
  noSavedGames: 'Nenhum jogo salvo encontrado',
  deleteSave: 'Excluir este salvamento?',
  chapter: 'Capítulo',
  chapterOf: 'Capítulo {number} de {total}',
  explored: '{percent}% explorado',
  theEnd: 'Fim',
  playAgain: 'Jogar novamente',
  carrying: 'Você está carregando:',
  nothingOfNote: 'nada de especial',
  loading: 'Carregando...',
  failedToLoad: 'Falha ao carregar dados do jogo. Verifique o console para erros.',
  confirmRestart: 'Tem certeza de que deseja recomeçar? Seu progresso será perdido se não tiver salvado.',
  confirmDelete: 'Excluir este salvamento?',
  and: 'e',
};

const dutch: UIStrings = {
  save: 'Opslaan',
  load: 'Laden',
  menu: 'Menu',
  saveGame: 'Spel opslaan',
  loadGame: 'Spel laden',
  cancel: 'Annuleren',
  close: 'Sluiten',
  restart: 'Herstarten',
  enterSaveName: 'Naam van opslag...',
  noSavedGames: 'Geen opgeslagen spellen gevonden',
  deleteSave: 'Deze opslag verwijderen?',
  chapter: 'Hoofdstuk',
  chapterOf: 'Hoofdstuk {number} van {total}',
  explored: '{percent}% verkend',
  theEnd: 'Einde',
  playAgain: 'Opnieuw spelen',
  carrying: 'Je draagt bij je:',
  nothingOfNote: 'niets bijzonders',
  loading: 'Laden...',
  failedToLoad: 'Spelgegevens konden niet worden geladen. Controleer de console voor fouten.',
  confirmRestart: 'Weet je zeker dat je opnieuw wilt beginnen? Je voortgang gaat verloren als je niet hebt opgeslagen.',
  confirmDelete: 'Deze opslag verwijderen?',
  and: 'en',
};

/**
 * Map of language names to translations.
 * Keys are the language names as they appear in gameData.meta.language.
 */
const translations: Record<string, UIStrings> = {
  English: english,
  German: german,
  Deutsch: german,
  French: french,
  Français: french,
  Spanish: spanish,
  Español: spanish,
  Italian: italian,
  Italiano: italian,
  Portuguese: portuguese,
  Português: portuguese,
  Dutch: dutch,
  Nederlands: dutch,
};

/**
 * Get UI strings for the given language.
 * Falls back to English if the language is not supported.
 */
export function getUIStrings(language?: string): UIStrings {
  if (!language) return english;
  return translations[language] ?? english;
}
