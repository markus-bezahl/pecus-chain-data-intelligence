import React from "react";
import AnimalStatisticsList from "./AnimalStatisticsList";
import EconomicManagement from "./EconomicManagement";

export default function HerdManagement({ user, settings }) {
  return (
    <div className="p-6">
        {/* Economic Management Section */}
        <EconomicManagement user={user} settings={settings} />

        {/* Animal Statistics List Section */}
        <AnimalStatisticsList user={user} settings={settings} />
    </div>
  );
}
