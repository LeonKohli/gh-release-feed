# Repo-Filter und Suche im Release-Feed

Die App dient vor allem dem wiederkehrenden Durchsehen veröffentlichter Releases. Dabei entstehen zwei unterschiedliche Fragen: Was hat ein bestimmtes Projekt veröffentlicht? Und welche Releases enthalten eine bestimmte Änderung?

Die bisherige Suche vermischte Repository-Namen, Projektbeschreibungen, Release-Titel, Versionen und bereits geladene Notes. Durch Scrollen konnten zusätzliche Notes und damit weitere Suchtreffer erscheinen. Nutzer konnten nicht erkennen, warum ein Release gefunden wurde. Diese Bewertung folgt aus dem bestehenden Verhalten und Leons beschriebenem Arbeitsablauf. Eine Nutzerstudie liegt nicht vor.

## Repo-Auswahl und Suche haben getrennte Aufgaben

Der Repo-Filter zeigt `owner/name`, Projektbeschreibung und Release-Anzahl. Seine Auswahl lässt sich nach Repository, Owner und Beschreibung durchsuchen. Das hilft auch dann, wenn der Projektname bekannt ist, der Zweck aber nicht mehr.

Die Optionen stammen aus dem gesamten geladenen Feed. Sie verschwinden beim Wechseln des Release-Typs oder der Suchanfrage nicht. Verfügbar sind Projekte mit Releases im aktuellen Zeitfenster. Der Feed enthält bis zu neun aktuelle Releases je Projekt und gegebenenfalls dessen letztes stabiles Release. Alle Veröffentlichungen müssen innerhalb der letzten drei Monate liegen.

Die Release-Suche durchsucht standardmäßig Titel und Versionen. Eine Anfrage wie `v3.5` findet dadurch konkrete Veröffentlichungen unabhängig davon, welche Notes bereits geladen sind.

Der ausdrücklich gewählte Modus **Release notes** durchsucht den Inhalt der Notes, etwa nach `security`, `breaking` oder einer Ticketnummer. Bei einer Suchanfrage lädt die App fehlende Notes innerhalb des gewählten Repositorys und Release-Typs nach. Währenddessen sind Ergebnisse vorläufig. Fehlgeschlagene Abrufe bleiben sichtbar und können erneut versucht werden. Ein Textausschnitt mit markiertem Suchbegriff erklärt jeden Treffer, auch wenn die Fundstelle unterhalb der eingeklappten Vorschau liegt.

Repo-Auswahl, Release-Typ und Suche wirken gemeinsam. Ergebniszahl, Zurücksetzen, Notes-Abruf und leerer Zustand berücksichtigen dieselbe Auswahl.

## Kompakte Filterleiste

Die erste Umsetzung machte aus den Filtern einen Formularblock: sichtbare Labels und Hilfstexte, eine eigene Typzeile und zwei Metadatenzeilen. Das gab den Werkzeugen zu viel Gewicht gegenüber den Releases.

Repo, Typ und Suche teilen sich jetzt ab 640 Pixel Bildschirmbreite eine 36 Pixel hohe Zeile mit gemeinsamen Kanten. Die zugänglichen Namen bleiben erhalten. Erläuterungen zur Suche stehen im geöffneten Suchmenü. Die Ergebniszahl und das Zeitfenster bilden eine einzelne dezente Zeile darunter. Unter 768 Pixel ersetzt ein Typmenü die breite Toggle-Gruppe; unter 640 Pixel nimmt die Suche eine eigene volle Zeile ein. Zurücksetzen erscheint als Icon nur bei aktiven Filtern.

Bei 1280 Pixel Bildschirmbreite sank die Höhe des gesamten Filterbereichs einschließlich Ergebniszahl von 200,25 auf 74 Pixel. [Vorher](feed-toolbar-before.png) und [nachher](feed-toolbar-desktop.png) zeigen denselben Feed mit Testdaten.

## Prüfung

`bun run check` besteht mit 48 Tests; der Produktionsbuild besteht ebenfalls. Neue Regressionstests wurden mit gezielten Fehlern rot geprüft: Titel-Treffer verändern sich durch nachgeladene Notes nicht, Repo-Auswahl wirkt zusammen mit Release-Typ und Notes-Suche, Notes-Suche findet keine Versionsnamen, der Treffer-Ausschnitt zeigt eine versteckte Fundstelle, und Repo-Optionen unterscheiden gleichnamige Projekte verschiedener Owner ohne Duplikate. Der bisherige allgemeine Suchtest wurde an den absichtlich eingeschränkten Suchumfang angepasst.

Im Browser wurde der Produktionsbuild mit API-Testdaten geprüft: Repo-Auswahl per Tastatur, Wechsel zwischen Titel- und Notes-Suche, kombinierte Filter, Zurücksetzen und 390 Pixel Bildschirmbreite ohne horizontalen Überlauf. Ein simulierter HTTP-503-Fehler zeigte vorhandene Treffer und 36 noch ungesuchte Notes; der erneute Abruf vervollständigte die Ergebnisse. Dies ersetzt keinen OAuth-Durchlauf mit einem echten Konto.

Die kompakte Leiste wurde zusätzlich bei 320, 390, 640, 768 und 1280 Pixel Bildschirmbreite ohne horizontalen Überlauf geprüft, auch mit aktiven Filtern und ausgewähltem Repo. Mobile Typauswahl, Tastaturauswahl eines Repos, Notes-Suche und Zurücksetzen funktionieren im Produktionsbuild. Die helle und dunkle Darstellung wurde visuell geprüft. Für diese Layoutkorrektur wurden keine neuen Unit-Tests ergänzt; Browserprüfung deckt den visuellen Fehler und die neue mobile Bedienung ab.

Die [mobile Ansicht](repository-filter-mobile.png) zeigt die kompakte Leiste mit Testdaten.

## Nächste sinnvolle Erweiterungen

Die Reihenfolge folgt dem beschriebenen Arbeitsablauf. Der erste Punkt ist inzwischen umgesetzt; die übrigen Vorschläge bleiben offen:

1. **Seit dem letzten Besuch (umgesetzt am 17. Oktober).** Neue Veröffentlichungen werden relativ zum letzten ausdrücklich abgeschlossenen Besuch je Konto markiert. Die genaue Semantik steht unten.
2. **Repos im Feed stummschalten.** Projekte mit vielen Veröffentlichungen können andere verdrängen. Eine lokale Auswahl erlaubt, ihre Releases auszublenden und die GitHub-Sterne trotzdem zu behalten.
3. **Zeitraum auswählen.** Woche, Monat und drei Monate erleichtern unterschiedlich häufige Besuche. Innerhalb des vorhandenen Zeitfensters braucht der Filter keine weiteren API-Anfragen. Ältere Historien erfordern einen eigenen Abruf und einen deutlich benannten größeren Umfang.

## Last completed visit (October 17, 2026)

A visit is completed only by **Mark feed reviewed**. Opening, refreshing, scrolling,
searching, changing filters, loading more cards, and leaving the page never advance it.
On the first visit no releases receive a New badge; an explanation asks the user to
establish their first review boundary explicitly. Until then, returning remains a first visit.

Completion covers the entire successfully loaded feed, including filtered-out releases
and cards beyond the current pagination limit. The action states this scope and is disabled
while fetching or after a failed/partial fetch. It records the start of the most recent
successful fetch (or that snapshot's persisted boundary when using the cache), rather than
the click time. Publications strictly after that boundary remain new, including publications
that arrive during fetching or reading. An equal timestamp is considered reviewed.
A refresh can advance the available snapshot, but never completes a visit by itself.
This is a feed-level acknowledgement, not a claim that every release was read.

Each account stores its boundary in its existing IndexedDB metadata store under
`github-release-feed-visit-v1`, separate from cache freshness. Clearing cached releases
preserves completed visits. Writes are monotonic across tabs; already-open tabs retain
their current indicators until their next account initialization. Unavailable storage
keeps the feed and review action usable in memory and displays a persistence limitation.
Progress is local to this browser, not synchronized across devices. Badges apply to each
release within grouped cards; the polite summary counts matching releases across all pages.
Repository muting remains separate: no repository preferences or filters are changed here.
