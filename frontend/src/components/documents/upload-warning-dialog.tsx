"use client";

import { AlertTriangle } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface UploadWarningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

export function UploadWarningDialog({
  open,
  onOpenChange,
  onConfirm,
}: UploadWarningDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-beac-rouge">
            <AlertTriangle className="h-5 w-5" />
            Avertissement
          </DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Il est strictement interdit de telecharger des documents contenant des mots de passe, des identifiants, des donnees personnelles ou toute information confidentielle. En continuant, vous confirmez que votre document ne contient aucune de ces informations.
        </p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuler
          </Button>
          <Button
            className="bg-beac-bleue hover:bg-beac-bleue-dark text-white"
            onClick={() => {
              onOpenChange(false);
              onConfirm();
            }}
          >
            J&apos;ai compris
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
