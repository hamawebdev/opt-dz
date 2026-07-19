import { useTranslation } from "react-i18next";
import { Users } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCalendar } from "@/features/calendar/contexts/calendar-context";
import { getInitials } from "@/features/calendar/helpers";

/** Narrows the calendar to one optometrist's column of work. Hidden when the
 * shop only ever books one person, where the filter would be noise. */
export function OptometristSelect() {
  const { t } = useTranslation();
  const { optometrists, selectedOptometrist, setSelectedOptometrist } =
    useCalendar();

  // Hidden when the shop only ever books one person, where the filter would be
  // noise — but never while a filter is active, or there would be no way to
  // clear it after navigating to a quieter month.
  const isFiltering = selectedOptometrist !== "all";
  if (optometrists.length < 2 && !isFiltering) return null;

  // The active optometrist may have no appointments in the new period; keep the
  // option present so the Select still shows what it is filtering by.
  const options = isFiltering && !optometrists.includes(selectedOptometrist)
    ? [selectedOptometrist, ...optometrists]
    : optometrists;

  return (
    <Select
      value={selectedOptometrist}
      onValueChange={setSelectedOptometrist}
    >
      <SelectTrigger className="w-full sm:w-52">
        <SelectValue placeholder={t("appointments.optometrist")} />
      </SelectTrigger>
      <SelectContent align="end">
        <SelectItem value="all">
          <span className="flex items-center gap-2">
            <Users className="size-4" />
            {t("appointments.allOptometrists")}
          </span>
        </SelectItem>
        {options.map((name) => (
          <SelectItem key={name} value={name}>
            <span className="flex items-center gap-2">
              <Avatar className="size-6">
                <AvatarFallback className="text-[0.6rem]">
                  {getInitials(name)}
                </AvatarFallback>
              </Avatar>
              <span className="truncate">{name}</span>
            </span>
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
