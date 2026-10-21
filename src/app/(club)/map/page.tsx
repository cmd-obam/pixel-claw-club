import { MapScreen } from "@/components/map-screen";
import { loadMapScreen } from "@/server/data";

export default async function MapPage() {
  const screen = await loadMapScreen();
  return <MapScreen places={screen.places} map={screen.map} practice={screen.mode === "demo"} />;
}
