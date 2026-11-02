// PAWtastic Daycare Tycoon — instructions that match the player's controls (Stage A, spec §3.3). "3d" is the stage,
// "map" the 2D map shown when 3D can't load, "list" the list view chosen in Settings. Only 3D can drag out rooms.
import type { TourBeat } from "./types";

export type Controls = "3d" | "map" | "list";
export type BeatCtx = { first: string; second: string; third: string; group: string; upgrade: string };

const tapDog = (c: Controls, name: string) =>
  c === "3d" ? `Tap ${name} in the daycare` : c === "map" ? `Tap ${name} on the map` : `Find ${name} on the list`;

/** The coach's line for a tour beat: a short title and one action. */
export function beatText(beat: TourBeat, c: Controls, x: BeatCtx): { title: string; action: string } {
  switch (beat) {
    case "meet":
      return { title: "Build your daycare", action: "Follow the building steps below, then switch Open on — your first pup arrives as soon as you open." };
    case "checkin":
      return {
        title: `Meet ${x.first}!`,
        action: c === "list" ? `${x.first} is waiting at the Front desk — tap Check in.` : `${tapDog(c, x.first)}, then Check in.`,
      };
    case "place":
      return { title: `Find ${x.first} a playroom`, action: `${tapDog(c, x.first)}, then “To ${x.group}”. Pups play with others their size and energy.` };
    case "play":
      return { title: "Playtime!", action: `${tapDog(c, x.first)}, then Playtime. Happy pups pay more at pick-up.` };
    case "checkout":
      return { title: "Home time", action: `${tapDog(c, x.first)}, then Check out to collect your first payment.` };
    case "upgrade":
      return {
        title: "Your first upgrade",
        action: "Pick one below — it goes in the first free spot, and you can move it later.",
      };
    case "benefit":
      return { title: "See what it does", action: `${x.second} is here. Check her in, find her a playroom and give her playtime — watch the bonus from your ${x.upgrade}.` };
    case "decision":
      return {
        title: "A real decision",
        action: `${x.third} is large and full of energy — he can't share with small, gentle pups. Build him a Large & Active playroom, or let him rest in the calm room today (he goes home free).`,
      };
    case "goals":
      return { title: "You're running a daycare!", action: "Pick your next goal below. Drop-offs and the day clock run from now on." };
  }
}

/** The building checklist's step text (steps 1–5) for these controls. */
export function guideText(step: number, c: Controls): string {
  const three = c === "3d";
  switch (step) {
    case 1:
      return three
        ? "Drag out a 4 × 3 room, add a door on the road side and a path to the entrance, then place the Front Desk Counter and a Waiting Bench."
        : "Tap Build, then Lobby (it comes with a door and a path). Then add the Front Desk Counter and a Waiting Bench from Build.";
    case 2:
      return three
        ? "Draw it next to the Lobby and pick its group. Add a door into the Lobby, then place 2 Dog Beds and a Water Bowl."
        : "Tap Build, then a Playroom for one group of pups. Then add 2 Dog Beds and a Water Bowl from Build.";
    case 3:
      return three ? "A small room with a door, where overwhelmed pups can settle." : "Tap Build, then Calm-Down Room — where overwhelmed pups can settle.";
    case 4:
      return three ? "Pick a floor and a wall colour. This step is optional." : "Tap a room, then Paint to pick a floor and wall colour. This step is optional.";
    default:
      return "Switch Open on, check the first pup in, put it in the playroom, give it playtime, then check it out.";
  }
}
