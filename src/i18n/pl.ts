// Polish dictionary: the default language, and the source of the dictionary shape. `en.ts` is typed
// against this object (see `Dictionary` in index.ts), so a key present here and missing there (or the
// reverse) fails `npx astro check`. Browser-safe on purpose: islands import it.
//
// An entry that depends on a count is a function of the number and uses `plural()` for the forms.
import { plural } from "@/i18n/plural";

export const pl = {
  language: {
    // Names the switch for assistive technology; the visible text is the short code of the other language.
    switchTo: {
      pl: "Zmień język na polski",
      en: "Zmień język na angielski",
    },
    short: {
      pl: "PL",
      en: "EN",
    },
  },
  config: {
    attention: "Uwaga:",
    items: {
      supabase: {
        message: "Supabase nie jest skonfigurowany — funkcje uwierzytelniania są wyłączone.",
        docsLabel: "Zobacz instrukcję konfiguracji",
      },
    },
  },
  header: {
    mainNav: "Główna nawigacja",
    trainings: "Treningi",
    dashboard: "Panel",
    accountMenu: "Menu konta",
    profile: "Profil",
    signIn: "Zaloguj się",
    signOut: "Wyloguj się",
  },
  theme: {
    group: "Motyw kolorów",
    light: "Jasny",
    dark: "Ciemny",
  },
  common: {
    signedInAs: "Zalogowano jako",
  },
  positions: {
    setter: "Rozgrywający",
    outside: "Przyjmujący",
    opposite: "Atakujący",
    middle: "Środkowy",
    libero: "Libero",
  },
  auth: {
    fields: {
      email: "Adres e-mail",
      password: "Hasło",
      confirmPassword: "Potwierdź hasło",
    },
    passwordToggle: {
      show: "Pokaż hasło",
      hide: "Ukryj hasło",
    },
    validation: {
      emailRequired: "Podaj adres e-mail",
      emailInvalid: "Podaj poprawny adres e-mail",
      passwordRequired: "Podaj hasło",
      passwordTooShort: (min: number) =>
        `Hasło musi mieć co najmniej ${min} ${plural("pl", min, { one: "znak", few: "znaki", many: "znaków", other: "znaku" })}`,
      passwordMoreNeeded: (remaining: number) =>
        `Wpisz jeszcze ${remaining} ${plural("pl", remaining, { one: "znak", few: "znaki", many: "znaków", other: "znaku" })}`,
      confirmRequired: "Potwierdź hasło",
      passwordsDiffer: "Hasła nie są takie same",
    },
    signIn: {
      pageTitle: "Logowanie",
      heading: "Witaj ponownie",
      description: "Zaloguj się do systemu",
      submit: "Zaloguj się",
      pending: "Logowanie...",
      noAccount: "Nie masz konta?",
      signUpLink: "Zarejestruj się",
    },
    signUp: {
      pageTitle: "Rejestracja",
      heading: "Zaczynamy",
      description: "Skonfigurujmy Twoje konto",
      submit: "Utwórz konto",
      pending: "Tworzenie konta...",
      haveAccount: "Masz już konto?",
      signInLink: "Zaloguj się",
    },
    confirmEmail: {
      registered: {
        heading: "Rejestracja zakończona",
        description: "Konto zostało utworzone. Możesz się teraz zalogować.",
        link: "Przejdź do logowania",
      },
      checkInbox: {
        heading: "Sprawdź skrzynkę e-mail",
        description: "Wysłaliśmy link potwierdzający na Twój adres e-mail. Kliknij go, aby aktywować konto.",
        link: "Wróć do logowania",
      },
    },
    // Messages for Supabase auth error codes (see src/lib/auth-errors.ts); `generic` covers every other code.
    errors: {
      invalidCredentials: "Nieprawidłowy adres e-mail lub hasło",
      alreadyRegistered: "Konto z tym adresem e-mail już istnieje",
      weakPassword: "Hasło jest zbyt słabe. Wybierz dłuższe i trudniejsze do odgadnięcia",
      invalidEmail: "Ten adres e-mail jest nieprawidłowy",
      tooManyRequests: "Zbyt wiele prób. Spróbuj ponownie za chwilę",
      emailNotConfirmed: "Potwierdź adres e-mail, zanim się zalogujesz",
      signupDisabled: "Rejestracja jest obecnie wyłączona",
      notConfigured: "Supabase nie jest skonfigurowany — logowanie jest wyłączone",
      generic: "Coś poszło nie tak. Spróbuj ponownie",
    },
  },
  profile: {
    pageTitle: "Twój profil",
    heading: "Twój profil",
    saved: "Profil zapisany.",
    name: "Nazwa",
    namePlaceholder: "Jak zna Cię grupa",
    nameHint: (max: number) =>
      `Widoczna na listach zapisanych. Najwyżej ${max} ${plural("pl", max, { one: "znak", few: "znaki", many: "znaków", other: "znaku" })}.`,
    primaryPosition: "Pozycja główna",
    secondaryPosition: "Pozycja dodatkowa",
    noPosition: "Brak pozycji",
    secondaryHint: "Opcjonalnie. Najpierw wybierz pozycję główną.",
    submit: "Zapisz",
    pending: "Zapisywanie…",
    unavailable: {
      loadFailed: "Nie udało się wczytać Twojego profilu. Spróbuj ponownie za chwilę.",
      missing: "Brak Twojego profilu. Wyloguj się i zaloguj ponownie, a potem spróbuj jeszcze raz.",
    },
    errors: {
      missingNickname: "Podaj nazwę",
      nicknameTooLong: (max: number) =>
        `Nazwa może mieć najwyżej ${max} ${plural("pl", max, { one: "znak", few: "znaki", many: "znaków", other: "znaku" })}`,
      invalidPosition: "Wybierz pozycję z listy",
      secondaryWithoutPrimary: "Najpierw wybierz pozycję główną, potem dodatkową",
      secondaryEqualsPrimary: "Pozycja dodatkowa musi różnić się od głównej",
      notFound: "Nie znaleziono profilu",
      saveFailed: "Nie udało się zapisać profilu. Spróbuj ponownie.",
    },
  },
  home: {
    heading: "Treningi siatkówki, zapis jednym kliknięciem.",
    lead: "FullRotation trzyma cotygodniowe treningi grupy w jednym miejscu: kto jest zapisany, kto czeka na liście rezerwowej i czy trening się odbędzie.",
    goToDashboard: "Przejdź do panelu",
    signIn: "Zaloguj się",
    createAccount: "Utwórz konto",
    howItWorks: "Jak to działa",
    features: {
      signUp: {
        title: "Zapis z linku",
        text: "Otwórz link do treningu z czatu grupy i zajmij miejsce jednym kliknięciem.",
      },
      whoIsIn: {
        title: "Zobacz, kto się zapisał",
        text: "Lista główna ma 12 miejsc. Potem trafiasz na listę rezerwową i awansujesz, gdy ktoś się wypisze.",
      },
      decided: {
        title: "Odbędzie się albo nie, wiesz od razu",
        text: "Zapisy zamykają się 3 godziny przed treningiem. Przy 10 osobach lub więcej trening się odbywa, przy mniejszej liczbie jest odwoływany.",
      },
    },
  },
  dashboard: {
    pageTitle: "Panel",
    heading: "Panel",
    hint: "Otwórz trening z linku, który organizator udostępnia na czacie grupy.",
    profile: "Twój profil",
    organizer: "Organizator: treningi",
    signOut: "Wyloguj się",
  },
  training: {
    status: {
      open: "Zapisy otwarte",
      finalizing: "Finalizacja",
      confirmed: "Potwierdzony",
      cancelled: "Odwołany",
    },
    unavailable: {
      loadFailedTitle: "Nie udało się wczytać tego treningu",
      loadFailedMessage: "Coś poszło nie tak. Spróbuj ponownie za chwilę.",
      notFoundTitle: "Nie znaleziono treningu",
      notFoundMessage: "Ten trening nie istnieje albo link jest błędny.",
    },
    details: {
      start: "Start",
      location: "Miejsce",
      note: "Notatka",
      signups: "Zapisy",
      signupsOpenUntil: (when: string) => `Zapisy otwarte do ${when}`,
      signupsClosed: "Zapisy są zamknięte",
    },
    errors: {
      missingTitle: "Podaj tytuł",
      titleTooLong: (max: number) =>
        `Tytuł może mieć najwyżej ${max} ${plural("pl", max, { one: "znak", few: "znaki", many: "znaków", other: "znaku" })}`,
      missingLocation: "Podaj miejsce",
      locationTooLong: (max: number) =>
        `Miejsce może mieć najwyżej ${max} ${plural("pl", max, { one: "znak", few: "znaki", many: "znaków", other: "znaku" })}`,
      noteTooLong: (max: number) =>
        `Notatka może mieć najwyżej ${max} ${plural("pl", max, { one: "znak", few: "znaki", many: "znaków", other: "znaku" })}`,
      invalidStart: "Podaj poprawną datę i godzinę rozpoczęcia",
      startsTooSoon: (hours: number) =>
        `Trening musi zaczynać się za więcej niż ${hours} ${plural("pl", hours, { one: "godzinę", few: "godziny", many: "godzin", other: "godziny" })} od teraz`,
      signupClosed: "Zapisy na ten trening są zamknięte; nie można go już edytować",
      notFound: "Nie znaleziono treningu",
      saveFailed: "Nie udało się zapisać treningu. Spróbuj ponownie.",
    },
  },
  signup: {
    notice: {
      signedUp: "Zapis przyjęty.",
      withdrawn: "Zapis wycofany.",
    },
    mainList: "Lista główna",
    waitlist: "Lista rezerwowa",
    youAreIn: "Jesteś na liście.",
    youWillMoveUp: "Awansujesz, jeśli ktoś się wypisze.",
    spotsLeft: (free: number, size: number) => `Wolne miejsca na liście głównej: ${free} z ${size}.`,
    mainFull: "Lista główna jest pełna — zapis teraz oznacza miejsce na liście rezerwowej.",
    signUp: "Zapisz się",
    withdraw: "Wypisz się",
    lateWithdrawNote: "Zapisy są zamknięte. Wypisanie się teraz może zostać policzone jako nieobecność.",
    emptyMain: "Nikt się jeszcze nie zapisał.",
    emptyWaitlist: "Nikt nie czeka.",
    you: "ty",
    manage: "Zarządzaj",
    rosterUnavailable: "Nie udało się wczytać listy zapisanych. Spróbuj ponownie za chwilę.",
    blockReason: (absences: number, window: number) =>
      `Nie możesz zapisać się na ten trening: ${absences} ${plural("pl", absences, { one: "nieobecność", few: "nieobecności", many: "nieobecności", other: "nieobecności" })} w ostatnich ${window} treningach. Odpuść ten trening, a znowu będzie można się zapisać.`,
    errors: {
      signupClosed: "Zapisy na ten trening są zamknięte",
      alreadySignedUp: "Masz już zapis na ten trening",
      overlappingSignup: (minutes: number) =>
        `Masz już zapis na inny trening zaczynający się w ciągu ${minutes} ${plural("pl", minutes, { one: "minuty", few: "minut", many: "minut", other: "minuty" })} od tego`,
      playerBlocked: "Nie możesz zapisać się na ten trening",
      notSignedUp: "Nie masz zapisu na ten trening",
      notFound: "Nie znaleziono treningu",
      saveFailed: "Coś poszło nie tak. Spróbuj ponownie.",
    },
  },
  forbidden: {
    title: "Tylko dla organizatorów",
    description: "Ta część jest dostępna tylko dla kont organizatorów.",
    back: "Wróć do panelu",
  },
};
