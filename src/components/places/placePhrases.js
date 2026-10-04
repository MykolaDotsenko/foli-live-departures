// The words each saved place speaks in its own voice: the button that gets
// a passenger there, the setup prompts and the sharing warnings. Kept as a
// table so every card, form and import prompt names the place the same way.
import { msg, t } from "../../i18n";

// Phrases that name a place are the place's own: Finnish puts the place in
// the case the sentence needs ("kotiin", "kodin", "koulun", "työpaikan"),
// which a label set into a shared phrase cannot take. Stop names are the
// ones never inflected (docs/LOCALIZATION.md).
export const PLACE_PHRASES = {
  home: {
    go: msg("Get me Home"),
    choose: msg("Tick the stops you use to get Home."),
    rightStop: msg("Save only if this is the right stop for Home."),
    rightStops: msg("Save only if these are the right stops for Home."),
    backupAdvice: msg(
      "Add backup stops only if you know they are suitable and familiar for arriving at Home."
    ),
    open: msg("Open Home stop"),
    setupTitle: msg("Choose stops for Home"),
    locate: msg("Use my location to set up Home"),
    useStop: msg("Use {name} for Home"),
    manage: msg("Manage Home"),
    sharing: msg(
      "Sharing Home reveals its saved public stop names and numbers, which can indicate the general area."
    ),
    // Finnish takes these as objects, "Tallenna koulu", not "Tallenna
    // Koulu", which read like a name.
    save: msg("Save Home"),
    add: msg("Add Home"),
    replace: msg("Replace Home"),
    addQuestion: msg("Add Home?"),
    replaceQuestion: msg("Replace Home?"),
    shareText: msg("Add Home to My Places"),
  },
  school: {
    go: msg("Go to School"),
    choose: msg("Tick the stops you use to get to School."),
    rightStop: msg("Save only if this is the right stop for School."),
    rightStops: msg("Save only if these are the right stops for School."),
    backupAdvice: msg(
      "Add backup stops only if you know they are suitable and familiar for arriving at School."
    ),
    open: msg("Open School stop"),
    setupTitle: msg("Choose stops for School"),
    locate: msg("Use my location to set up School"),
    useStop: msg("Use {name} for School"),
    manage: msg("Manage School"),
    sharing: msg(
      "Sharing School reveals its saved public stop names and numbers, which can indicate the general area."
    ),
    // Finnish takes these as objects, "Tallenna koulu", not "Tallenna
    // Koulu", which read like a name.
    save: msg("Save School"),
    add: msg("Add School"),
    replace: msg("Replace School"),
    addQuestion: msg("Add School?"),
    replaceQuestion: msg("Replace School?"),
    shareText: msg("Add School to My Places"),
  },
  work: {
    go: msg("Go to Work"),
    choose: msg("Tick the stops you use to get to Work."),
    rightStop: msg("Save only if this is the right stop for Work."),
    rightStops: msg("Save only if these are the right stops for Work."),
    backupAdvice: msg(
      "Add backup stops only if you know they are suitable and familiar for arriving at Work."
    ),
    open: msg("Open Work stop"),
    setupTitle: msg("Choose stops for Work"),
    locate: msg("Use my location to set up Work"),
    useStop: msg("Use {name} for Work"),
    manage: msg("Manage Work"),
    sharing: msg(
      "Sharing Work reveals its saved public stop names and numbers, which can indicate the general area."
    ),
    // Finnish takes these as objects, "Tallenna koulu", not "Tallenna
    // Koulu", which read like a name.
    save: msg("Save Work"),
    add: msg("Add Work"),
    replace: msg("Replace Work"),
    addQuestion: msg("Add Work?"),
    replaceQuestion: msg("Replace Work?"),
    shareText: msg("Add Work to My Places"),
  },
};

export function journeyAction(place) {
  return t(PLACE_PHRASES[place.id].go);
}
