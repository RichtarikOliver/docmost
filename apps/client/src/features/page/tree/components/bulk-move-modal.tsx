import { useState } from "react";
import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { generateJitteredKeyBetween } from "fractional-indexing-jittered";
import { selectedPagesAtom } from "@/features/page/tree/atoms/selected-pages-atom";
import { DestinationPicker } from "@/components/ui/destination-picker/destination-picker";
import { DestinationSelection } from "@/components/ui/destination-picker/destination-picker.types";
import { movePage } from "@/features/page/services/page-service";
import { queryClient } from "@/main";

interface BulkMoveModalProps {
  opened: boolean;
  onClose: () => void;
  initialSpaceId?: string;
}

export function BulkMoveModal({
  opened,
  onClose,
  initialSpaceId,
}: BulkMoveModalProps) {
  const { t } = useTranslation();
  const [selectedPages, setSelectedPages] = useAtom(selectedPagesAtom);
  const [selection, setSelection] = useState<DestinationSelection | null>(null);
  const [isMoving, setIsMoving] = useState(false);

  const handleMove = async () => {
    if (!selection) return;
    setIsMoving(true);

    const parentPageId =
      selection.type === "page" ? selection.pageId : undefined;

    let prevPosition: string | null = null;
    let movedCount = 0;

    try {
      for (const pageId of selectedPages) {
        const position = generateJitteredKeyBetween(prevPosition, null);
        await movePage({ pageId, parentPageId, position });
        prevPosition = position;
        movedCount++;
      }

      queryClient.removeQueries({
        predicate: (item) =>
          ["pages", "sidebar-pages", "root-sidebar-pages"].includes(
            item.queryKey[0] as string,
          ),
      });

      notifications.show({
        message: t("{{count}} pages moved successfully", { count: movedCount }),
      });
      setSelectedPages(new Set());
      setSelection(null);
      onClose();
    } catch {
      notifications.show({
        message: t("Failed to move some pages"),
        color: "red",
      });
    } finally {
      setIsMoving(false);
    }
  };

  const handleClose = () => {
    setSelection(null);
    onClose();
  };

  return (
    <Modal
      opened={opened}
      onClose={handleClose}
      title={
        <Text fw={500}>
          {t("Move {{count}} pages", { count: selectedPages.size })}
        </Text>
      }
      size={500}
      padding="xl"
      yOffset="10vh"
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t("Select a destination:")}
        </Text>
        <DestinationPicker
          onSelectionChange={setSelection}
          initialSpaceId={initialSpaceId}
        />
        <Group justify="flex-end" mt="xs">
          <Button variant="default" onClick={handleClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={handleMove} disabled={!selection} loading={isMoving}>
            {t("Move here")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
