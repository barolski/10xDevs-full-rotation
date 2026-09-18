## Siatkówka wtorki - MVP

### Problem
Organizuję cotygodniową siatkówkę rekreacyjną dla grupy ~20 osób.
Zapisy idą dziś przez WhatsAppa, a hala ma 12 miejsc i wymaga
minimum 10 osób, żeby gra miała sens. Lista zgłoszeń rozsypuje
się w wątku, w którym trudno stwierdzić, kto zajął miejsce, a
nikt nie odnotowuje, kto przyszedł. Osoba, która zapisuje się
i się nie pojawia, robi to bez konsekwencji: miejsce przepada,
bo nikt z rezerwy już go nie zajmie, a halę i tak trzeba
opłacić. Dwa razy w tym sezonie zebrało się 9 osób i decyzję
o odwołaniu podejmowałem w ostatniej chwili, licząc kciuki
w wątku. Drugi problem: po zebraniu składu trzeba na miejscu
dzielić ludzi na zespoły, co zajmuje 10 minut i zwykle kończy
się nierównymi drużynami.

### Użytkownik
Ja jako organizator (tworzę treningi, odhaczam obecność, ustawiam
ratingi) oraz gracze z grupy, którzy mają konto w systemie
i zapisują się na treningi z publicznego linku do wydarzenia.

### Profil gracza
Gracz zakłada konto raz i uzupełnia profil: imię i nazwisko oraz
dwie preferowane pozycje na boisku (podstawową i zapasową).
Pozycje są wykorzystywane przez regułę doboru składów. Każdy
gracz z kontem należy do jednej grupy treningowej i MVP obsługuje
dokładnie jedną taką grupę - to ona wyznacza zbiór osób, wobec
którego liczę, kto się jeszcze nie zapisał.

### Dlaczego konta są konieczne
Reguła blokady liczy nieobecności w oknie ośmiu treningów, więc
potrzebuje trwałej tożsamości gracza. Przy zapisach na samo imię
z linku wystarczy literówka albo dwa warianty tego samego
imienia, żeby historia się rozjechała, a osoba z blokadą
zapisała się jako nowy gracz.

### Widok statusu zapisów
Na stronie treningu organizator widzi wszystkich graczy z grupy,
a nie tylko tych zapisanych, w czterech stanach: na liście
głównej, na liście rezerwowej, bez reakcji na ten trening oraz
z aktywną blokadą za nieobecności. Ten widok jest odpowiedzią na
najczęstszy scenariusz w grupie dwudziestu osób, czyli 10 lub 11
zapisanych bez żadnego buforu: od razu wiadomo, kogo zaczepić,
i widać, czy dana osoba się nie odezwała, czy po prostu nie może
się zapisać. Gracz widzi wyłącznie listę główną i rezerwową, bez
informacji o tym, kto się nie zapisał i kto ma blokadę.

### Reguła biznesowa: prawo do zapisu
O przydziale miejsc decyduje kolejność zgłoszeń, ale gracz może
utracić prawo do zapisu. Kto dwa razy w ostatnich 8 odbytych
treningach był na liście głównej i nie przyszedł, nie może
zapisać się na najbliższy trening. Po odczekaniu jednego treningu
licznik zeruje się. Okno liczone jest jako 8 ostatnich treningów
grupy, a nie 8 treningów, w których gracz brał udział - dzięki
temu nowa osoba nie startuje z czystym kontem tylko dlatego, że
dopiero się dopisała. Licznik dotyczy wyłącznie osób z listy
głównej. Rezygnacja zgłoszona przed zamknięciem zapisów jest
darmowa: to gra rekreacyjna i plany ludziom się zmieniają.
Rezygnacja po zamknięciu zapisów podbija licznik tak samo jak
niezgłoszona nieobecność, bo na tak krótko przed grą zwolnione
miejsce zwykle zostaje niewykorzystane. Osoba z listy rezerwowej
nie ma licznika w ogóle - ani gdy zrezygnuje, ani gdy nie
przyjdzie - ponieważ nie ma zagwarantowanego miejsca na
parkiecie. Licznik zaczyna jej biec od momentu awansu na listę
główną.

### Reguła biznesowa: próg odbycia treningu
Lista główna ma 12 miejsc, a lista rezerwowa powstaje wyłącznie
wtedy, gdy wszystkie zostaną zajęte: dopiero trzynasta osoba
trafia na rezerwę. Trzy godziny przed treningiem aplikacja
sprawdza stan listy głównej i zamyka zapisy, więc nikt nowy nie
może się już dopisać.

Jeśli zapisanych jest mniej niż 10, trening dostaje status
odwołany. Rezerwa jest wtedy z definicji pusta, bo lista główna
nawet się nie zapełniła, więc nie ma kogo awansować. Odwołany
trening nie liczy nikomu nieobecności i nie wchodzi do okna
ośmiu treningów, bo gracz nie miał szansy przyjść.

Jeśli zapisanych jest 10 lub więcej, trening jest potwierdzony
na dobre. Późniejsza rezygnacja zwalnia miejsce pierwszej osobie
z rezerwy, o ile rezerwa w ogóle istnieje, czyli gdy zapisało się
co najmniej 13 osób. Przy 10 lub 11 zapisanych nie ma kogo
awansować i gramy w mniejszym składzie, także w dziewięć osób.

Sprawdzenie następuje tak późno świadomie, bo lista rusza się do
ostatniego dnia i decyzja dzień wcześniej odwoływałaby treningi,
które by się odbyły.

### Reguła biznesowa: zmiany po wygenerowaniu składów
Rezygnacja z listy głównej zwalnia miejsce pierwszej osobie
z listy rezerwowej, jeśli ktoś na niej jest. Skutek zależy od
tego, czy składy
zostały już wygenerowane. Jeśli jeszcze nie, awansowany gracz
po prostu trafia na listę główną i wejdzie do normalnego
podziału. Jeśli składy już istnieją, aplikacja nie przelicza
ich od nowa: awansowany gracz wchodzi dokładnie do tej drużyny,
z której ktoś się wypisał, nawet jeśli psuje to równowagę
ratingów. Stabilność składu, który gracze już widzieli, jest
tu ważniejsza niż idealny balans. Jedynym wyjątkiem jest
sytuacja, w której wypisała się jedyna osoba grająca w tej
drużynie na pozycji rozgrywającego: wtedy aplikacja wyznacza
zastępczego rozgrywającego wewnątrz tej samej drużyny, według
tej samej zasady co przy przydziale awaryjnym, nie zmieniając
obsady żadnej z drużyn.

### Reguła doboru składów
Z zapisanych i obecnych 10-12 osób aplikacja generuje dwa
zespoły tak, żeby liczebność drużyn różniła się najwyżej o
jedną osobę, a różnica sumy ratingów nie przekraczała ustalonego
progu. Przy doborze premiuje podziały, w których każda drużyna
ma gracza z pozycją rozgrywającego (podstawową albo zapasową).
Jeśli rozgrywających jest za mało - bo żaden się nie zapisał
albo jest tylko jeden - drużyna bez rozgrywającego dostaje
przydział awaryjny: aplikacja wyznacza gracza o najwyższym
ratingu w tej drużynie i wyraźnie oznacza go jako zastępczego
rozgrywającego. Trening nigdy nie blokuje się z powodu braku
rozgrywającego. Jedyny przypadek, w którym aplikacja odmawia
wygenerowania składów, to niemożność zmieszczenia się w progu
różnicy ratingów - wtedy mówi wprost, o ile próg jest
przekroczony.

### Pierwszy przepływ
Tworzę trening i dostaję publiczny link do wydarzenia -> wklejam
link na grupowego WhatsAppa ręcznie -> gracz wchodzi, zakłada
konto lub się loguje i zapisuje się; kolejność zgłoszeń wypełnia
12 miejsc, reszta trafia na rezerwę, a osoby z blokadą widzą
powód odmowy -> 3 godziny przed treningiem aplikacja pokazuje, czy
próg 10 osób jest spełniony, i zamyka zapisy albo odwołuje
trening -> w dniu treningu generuję składy -> jeśli ktoś
zrezygnuje już po ich wygenerowaniu, aplikacja podmienia go
w jego drużynie na pierwszą osobę z rezerwy -> po treningu
odhaczam obecność i liczniki nieobecności się aktualizują.

### Czego NIE robimy w MVP
- jakiejkolwiek integracji z WhatsAppem (link wklejam na grupę
  ręcznie, aplikacja nie czyta ani nie pisze wiadomości)
- automatycznego przeliczania ratingów po meczu (ratingi ustawiam ręcznie)
- statystyk indywidualnych i historii wyników meczów
- płatności za halę, kar finansowych i rozliczeń
- powiadomień push, maili i SMS-ów o odwołaniu treningu
- odwoływania blokady przez organizatora (reguła działa automatycznie)
- automatycznej modyfikacji profilu gracza przez system: przydział
  awaryjny zapisuje się w historii treningu, a nie jako nowa pozycja
  w profilu (inaczej jednorazowy przydział zamienia się w trwałą
  deklarację i reguła sama zaczyna karmić się własnymi decyzjami);
  propozycję dodania pozycji za zgodą gracza rozważę w drugiej iteracji
- obsługi wielu grup treningowych, ról poza organizatorem
  i graczem oraz zaproszeń do grupy (gracze zakładają konta sami)
- logowania przez Google, Facebooka i inne dostawców OAuth
- aplikacji mobilnej (tylko web na telefonie)

### Kryteria sukcesu
- liczba osób zapisanych i nieobecnych spada z obecnych ~2 na
  trening do maksymalnie 1 w ciągu 4 tygodni
- decyzję o odwołaniu treningu podejmuję na podstawie ekranu
  aplikacji, nie liczenia kciuków w wątku
- obecność odhaczam po każdym z 4 kolejnych treningów (bez tego
  reguła blokady nie ma z czego liczyć)
- składy generuję w mniej niż minutę, bez ręcznych poprawek
  w co najmniej 3 z 4 treningów
- co najmniej 15 z 20 osób z grupy ma konto i zapisuje się
  przez stronę

### Mój kontekst
Programuję od [X] lat, z agentem AI zrobiłem dotąd [opisz].
Mam około [Y] godzin tygodniowo i celuję w [termin oddania].
