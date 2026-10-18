# ♞ Guenda's Gambit

App di scacchi **giocabile direttamente nel browser**, con un **insegnante virtuale**
che commenta le tue mosse, **8 livelli di difficoltà** e **29 lezioni guidate** divise in
Base, Intermedio e Avanzato.

Nessuna installazione, nessuna dipendenza, nessun server: è un sito statico
(HTML + CSS + JavaScript) che funziona anche offline aprendo `index.html`.

---

## 🎮 Cosa puoi fare

| Sezione | Descrizione |
|---|---|
| **Gioca** | Partita contro il computer, con orologio opzionale, annulla mossa, suggerimento, analisi, rotazione della scacchiera ed export FEN/PGN. |
| **Insegnante** | Dopo ogni tua mossa ricevi un giudizio (*ottima, buona, imprecisione, errore, errore grave*, con simboli `!`, `?!`, `?`, `??`) e la spiegazione in italiano: cosa hai minacciato, quali pezzi sono in presa, quali tatticismi ci sono sulla scacchiera. |
| **Lezioni** | 29 esercizi con verifica automatica: matti in uno e in due, forchette, inchiodature, infilate, scoperte, attacchi a raggi X, arrocco, promozione, matto affogato... Le combinazioni a più mosse si giocano davvero: il computer risponde con la linea prevista e devi completare il piano. I progressi vengono salvati nel browser. |

I pezzi sono **disegnati in SVG** (non dipendono dai font del sistema) e l'interfaccia
si adatta da sola: su **smartphone** diventa a colonna con una barra dell'insegnante
sotto la scacchiera, pulsanti grandi da toccare e schede che restano agganciate in alto.

La scacchiera si può vestire con **9 stili** (verde classico, blu notte, grigio, marmo,
rosso, rosa, ocra, viola, acqua) scegliendoli dalle Impostazioni con i quadratini colorati.

### Livelli dell'avversario

1. **Principiante** (~400) — gioca quasi a caso
2. **Novizio** (~700)
3. **Dilettante** (~1000)
4. **Gambettista** (~1250)
5. **Intermedio** (~1500)
6. **Avanzato** (~1750)
7. **Esperto** (~2000)
8. **Maestro** (~2150)

### Funzioni dell'insegnante

- Giudizio su ogni mossa con la spiegazione del perché
- «La mossa migliore era …» quando c'è qualcosa di meglio
- Avvisi sui pezzi attaccati e non difesi
- Riconoscimento di aperture (Italiana, Spagnola, Siciliana, Gambetto di Donna…)
- Consigli su cosa guardare: centro, sviluppo, sicurezza del re, struttura pedonale
- Barra di valutazione della posizione
- Pulsante **Suggerimento** con freccia sulla scacchiera
- Pulsante **Analizza** con linea principale, materiale e fase di gioco
- Freccia rossa sulla mossa migliore che hai mancato, quando fai un errore

---

## 🚀 Giocare su GitHub Pages

Il progetto è pronto per essere pubblicato così com'è:

1. crea un repository su GitHub (es. `guendas-gambit`);
2. carica i file (o fai push da git);
3. vai in **Settings → Pages**;
4. in *Source* scegli **Deploy from a branch**, branch `main`, cartella `/ (root)`;
5. salva: dopo un minuto l'app è online su
   `https://IL-TUO-NOME.github.io/guendas-gambit/`.

Tutti i percorsi sono relativi, quindi funziona anche in una sottocartella.
Una volta pubblicata, il link si può aprire dal telefono e — se aggiunto alla
schermata iniziale — si comporta come una piccola app.

### In locale

Basta aprire `index.html` con un doppio clic (funziona da `file://`).
Se preferisci un server locale:

```bash
npx serve .
# oppure
python -m http.server
```

---

## 🗂️ Struttura

```
index.html          interfaccia (topbar, scacchiera, pannello laterale a schede)
css/style.css       tema scuro/chiaro, cornice della scacchiera, pannelli,
                    barra dell'insegnante per smartphone
js/engine.js        motore scacchistico (rappresentazione 0x88, mosse legali,
                    arrocco, en passant, promozione, FEN, SAN, Zobrist)
js/ai.js            valutazione posizionale + ricerca negamax con alpha-beta,
                    transposition table, null-move, LMR, quiescenza,
                    iterative deepening e 8 livelli di forza
js/coach.js         l'insegnante: spiegazioni in italiano, analisi tattica,
                    libro di aperture, dati delle lezioni
js/ui.js            scacchiera: pezzi SVG, rendering, selezione, trascinamento, suoni
js/app.js           logica dell'applicazione: partita, turni, lezioni, orologio
tests/              test automatici (Node, nessuna dipendenza)
```

I moduli usano un wrapper UMD: funzionano sia con `<script>` nel browser
sia con `require()` in Node.

---

## ✅ Test

Con [Node.js](https://nodejs.org) installato, dalla cartella del progetto:

```bash
node tests/perft.js      # correttezza del motore (perft, FEN, undo, hash...)
node tests/ai.js         # livelli, ricerche, matti, self-play
node tests/lessons.js    # verifica che ogni lezione sia risolvibile e coerente
node tests/candidates.js # (diagnostica) valutazione di posizioni di prova
node tests/debug.js      # (diagnostica) self-play e analisi di una posizione
```

`perft` è il test standard dei motori scacchistici: confronta il numero di
mosse legali a varie profondità con valori noti (posizione iniziale,
*kiwipete*, ecc.). Tutti i valori attesi sono superati.

---

## ⌨️ Scorciatoie

| Tasto | Azione |
|---|---|
| `←` `→` | scorri le mosse della partita |
| `↑` | torna all'ultima posizione |
| `H` | suggerimento |
| `F` | ruota la scacchiera |
| `U` | annulla la mossa |
| `Esc` | chiudi le finestre |

---

## 📝 Licenza

Codice liberamente utilizzabile per studio e didattica.
