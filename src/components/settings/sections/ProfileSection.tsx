"use client";
import { Clock, LocateFixed, MapPin, X } from "lucide-react";
import { useMemo, useState } from "react";
import { Avatar } from "@/components/glass/Avatar";
import { GlassButton } from "@/components/glass/GlassButton";
import { Combobox } from "@/components/ui/Combobox";
import { IconButton } from "@/components/ui/IconButton";
import { InsetGroup } from "@/components/ui/InsetGroup";
import { ListRow } from "@/components/ui/ListRow";
import { Select } from "@/components/ui/Select";
import { SkeletonRows } from "@/components/ui/Skeleton";
import { toast } from "@/components/ui/Toast";
import { api } from "@/lib/api";
import { useNow } from "@/lib/clock";
import { localTimeIn } from "@/lib/format";
import { cityToLocation } from "@/lib/queries/misc";
import { useProfile, useUpdateProfile } from "@/lib/queries/settings";
import type { City } from "@/lib/queries/types";
import type { LocationInput } from "@/lib/schemas";
import { safeTimeZone, tzOffsetMinutes } from "@/lib/time/zoned";
import { flag } from "@/lib/utils";
import { SectionPage } from "../SettingsShell";

type CityItem = { key: string; label: string; sub: string; countryCode: string | null; location: LocationInput };

const toItem = (l: LocationInput): CityItem => ({
  key: l.cityId ? `c${l.cityId}` : `${l.name}|${l.country}`,
  label: l.name,
  sub: [l.admin && l.admin !== l.name ? l.admin : null, l.country].filter(Boolean).join(", "),
  countryCode: l.countryCode ?? null,
  location: l,
});

const searchCities = async (q: string): Promise<CityItem[]> => {
  if (q.trim().length < 2) return [];
  const rows = await api.get<City[]>(`/api/geocode?q=${encodeURIComponent(q.trim())}`);
  return rows.map((c) => toItem(cityToLocation(c)));
};

const gmt = (minutes: number) => {
  const sign = minutes < 0 ? "−" : "+";
  const abs = Math.abs(minutes);
  return `GMT${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
};

function deviceTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return null;
  }
}

export function ProfileSection() {
  const { data: profile, isPending } = useProfile();
  const update = useUpdateProfile();
  const now = useNow();
  const [name, setName] = useState<string | null>(null);
  const [editingHome, setEditingHome] = useState(false);

  const currentZone = profile?.timezone;
  const zones = useMemo(() => {
    let list: string[] = [];
    try {
      list = Intl.supportedValuesOf("timeZone");
    } catch {
      list = [];
    }
    if (currentZone && !list.includes(currentZone)) list = [currentZone, ...list];
    const at = new Date();
    return list.map((tz) => ({ value: tz, label: tz.replace(/_/g, " "), description: gmt(tzOffsetMinutes(at, tz)) }));
  }, [currentZone]);

  if (isPending || !profile) {
    return (
      <SectionPage id="profile">
        <div className="surface overflow-hidden rounded-lg">
          <SkeletonRows count={4} />
        </div>
      </SectionPage>
    );
  }

  const home = profile.homeLocation
    ? toItem({
        cityId: profile.homeLocation.cityId,
        name: profile.homeLocation.name,
        admin: profile.homeLocation.admin,
        country: profile.homeLocation.country,
        countryCode: profile.homeLocation.countryCode,
        lat: profile.homeLocation.lat,
        lng: profile.homeLocation.lng,
        timezone: profile.homeLocation.timezone,
      })
    : null;

  const saveName = () => {
    if (name === null) return;
    const next = name.trim() || null;
    if (next === (profile.displayName ?? null)) return setName(null);
    update.mutate(
      { displayName: next },
      {
        onSuccess: () => {
          setName(null);
          toast.success("Name saved");
        },
        onError: (e) => toast.error("Couldn't save your name", { description: e.message }),
      },
    );
  };

  const setHome = (item: CityItem | null) => {
    const tz = item?.location.timezone ?? null;
    update.mutate(
      { homeLocation: item?.location ?? null, ...(tz ? { timezone: tz } : {}) },
      {
        onSuccess: () => toast.success(item ? `Home base: ${item.label}` : "Home base removed", tz && tz !== profile.timezone ? { description: `Time zone set to ${tz.replace(/_/g, " ")}` } : undefined),
        onError: (e) => toast.error("Couldn't update your home base", { description: e.message }),
      },
    );
  };

  const setZone = (tz: string) => update.mutate({ timezone: tz }, { onError: (e) => toast.error("Couldn't change the time zone", { description: e.message }) });
  const device = deviceTimeZone();
  const displayName = name ?? profile.displayName ?? "";

  return (
    <SectionPage id="profile">
      <div className="flex flex-col items-center gap-2 pb-1 text-center">
        <Avatar name={profile.displayName || profile.email} size={80} />
        <div>
          <p className="text-title2">{profile.displayName || "Add your name"}</p>
          <p className="text-subhead text-fg-3">{profile.email}</p>
        </div>
      </div>

      <InsetGroup header="Profile" footer="Your name appears in the daily digest and the AI's answers.">
        <label className="flex min-h-11 items-center gap-3 px-4">
          <span className="w-24 shrink-0 text-body text-fg">Name</span>
          <input
            value={displayName}
            onChange={(e) => setName(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") e.currentTarget.blur();
              if (e.key === "Escape") setName(null);
            }}
            placeholder="Your name"
            autoComplete="name"
            enterKeyHint="done"
            maxLength={100}
            className="h-11 min-w-0 flex-1 bg-transparent text-body text-fg outline-none placeholder:text-fg-4"
          />
        </label>
        <div className="mx-4 h-[0.5px] bg-separator" />
        <ListRow label="E-mail" value={profile.email} />
      </InsetGroup>

      <InsetGroup header="Home base" footer="Arcs on the globe start here, and it sets your time zone. Change it when you move.">
        {home && !editingHome ? (
          <ListRow
            leading={
              <span className="grid size-[30px] shrink-0 place-items-center text-title3 leading-none" aria-hidden>
                {flag(home.countryCode) || <MapPin size={18} className="text-accent-text" />}
              </span>
            }
            label={home.label}
            description={home.sub}
            accessory={
              <span className="flex items-center gap-1">
                <GlassButton size="sm" variant="plain" onClick={() => setEditingHome(true)}>
                  Change
                </GlassButton>
                <IconButton size="sm" variant="plain" label="Remove home base" icon={<X />} onClick={() => setHome(null)} />
              </span>
            }
          />
        ) : (
          <div className="flex items-center gap-2 p-3">
            <div className="min-w-0 flex-1">
              <Combobox<CityItem>
                aria-label="Search for your city"
                value={null}
                onChange={(c) => {
                  if (!c) return;
                  setHome(c);
                  setEditingHome(false);
                }}
                search={searchCities}
                debounceMs={180}
                autoFocus={editingHome}
                getKey={(c) => c.key}
                getLabel={(c) => c.label}
                placeholder="Search for your city"
                emptyText="Type at least two letters"
                renderItem={(c) => (
                  <span className="flex min-w-0 items-center gap-2.5">
                    <span className="text-title3 leading-none" aria-hidden>
                      {flag(c.countryCode) || <MapPin size={16} />}
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate font-medium">{c.label}</span>
                      <span className="block truncate text-footnote text-fg-3">{c.sub}</span>
                    </span>
                  </span>
                )}
              />
            </div>
            {home && (
              <GlassButton size="sm" variant="ghost" onClick={() => setEditingHome(false)}>
                Cancel
              </GlassButton>
            )}
          </div>
        )}
      </InsetGroup>

      <InsetGroup
        header="Time zone"
        footer={
          <>
            “Today”, due dates and the daily digest follow this time zone. It&apos;s {localTimeIn(profile.timezone, now) ?? "—"} there now.
          </>
        }
      >
        <div className="space-y-2 p-3">
          <Select aria-label="Time zone" searchable searchPlaceholder="Search time zones" value={profile.timezone} onChange={setZone} options={zones} />
          {device && device !== profile.timezone && (
            <GlassButton size="sm" variant="plain" onClick={() => setZone(device)} className="w-full justify-start sm:w-auto">
              <LocateFixed size={15} /> Use this device&apos;s time zone ({device.replace(/_/g, " ")})
            </GlassButton>
          )}
        </div>
        <ListRow icon={<Clock />} label="Local time" value={`${localTimeIn(profile.timezone, now) ?? "—"} · ${gmt(tzOffsetMinutes(new Date(now), safeTimeZone(profile.timezone)))}`} />
      </InsetGroup>
    </SectionPage>
  );
}
