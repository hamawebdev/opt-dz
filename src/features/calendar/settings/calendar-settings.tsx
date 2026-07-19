import { useTranslation } from "react-i18next";
import { Clock, Palette, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import {
  MAX_START_HOUR,
  MIN_START_HOUR,
  useCalendar,
} from "@/features/calendar/contexts/calendar-context";

/** Display preferences for the calendar, remembered between sessions. */
export function CalendarSettings() {
  const { t } = useTranslation();
  const {
    badgeVariant,
    setBadgeVariant,
    use24HourFormat,
    toggleTimeFormat,
    startOfDayHour,
    setStartOfDayHour,
    agendaGroupBy,
    setAgendaGroupBy,
  } = useCalendar();

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          aria-label={t("calendar.settings")}
        >
          <Settings2 className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>{t("calendar.settings")}</DropdownMenuLabel>
        <DropdownMenuSeparator />

        <DropdownMenuGroup>
          {/* onSelect is prevented so toggling does not close the menu. */}
          <DropdownMenuItem
            className="justify-between"
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex items-center gap-2">
              <Palette className="size-4" />
              {t("calendar.filledChips")}
            </span>
            <Switch
              checked={badgeVariant === "colored"}
              onCheckedChange={(checked) =>
                setBadgeVariant(checked ? "colored" : "dot")
              }
            />
          </DropdownMenuItem>

          <DropdownMenuItem
            className="justify-between"
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex items-center gap-2">
              <Clock className="size-4" />
              {t("calendar.use24Hour")}
            </span>
            <Switch
              checked={use24HourFormat}
              onCheckedChange={toggleTimeFormat}
            />
          </DropdownMenuItem>

          <DropdownMenuItem
            className="justify-between"
            onSelect={(e) => e.preventDefault()}
          >
            <span>{t("calendar.dayStartsAt")}</span>
            <Input
              type="number"
              className="w-20"
              value={startOfDayHour}
              min={MIN_START_HOUR}
              max={MAX_START_HOUR}
              onChange={(e) => setStartOfDayHour(Number(e.target.value))}
            />
          </DropdownMenuItem>
        </DropdownMenuGroup>

        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("calendar.agendaGroupBy")}</DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={agendaGroupBy}
          onValueChange={(value) =>
            setAgendaGroupBy(value as "date" | "status")
          }
        >
          <DropdownMenuRadioItem value="date">
            {t("common.date")}
          </DropdownMenuRadioItem>
          <DropdownMenuRadioItem value="status">
            {t("calendar.status")}
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
