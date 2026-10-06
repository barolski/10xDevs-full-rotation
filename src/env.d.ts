declare namespace App {
  interface Locals {
    user: import("@supabase/supabase-js").User | null;
    isOrganizer: boolean;
    // The request's UI language, read from the language cookie (Polish when there is none).
    lang: import("./i18n").Lang;
  }
}
