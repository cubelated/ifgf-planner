import {
  createServiceSection,
  deleteServiceSection,
  PlannerData,
  reorderServiceSections,
  ServiceSection,
  updateServiceSection,
} from "@/lib/planner-data";
import {
  closestCenter,
  DndContext,
  DragEndEvent,
  KeyboardSensor,
  MouseSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Check,
  GripVertical,
  LoaderCircle,
  MessageCircle,
  Pencil,
  Plus,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { FormEvent, ReactNode, useState } from "react";
import { PageHeader } from "../planner-app";

export default function SettingsView({
  data,
  onChanged,
}: {
  data: PlannerData;
  onChanged: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [selectedEventIds, setSelectedEventIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [editName, setEditName] = useState("");
  const [editEventIds, setEditEventIds] = useState<string[]>([]);
  const [sectionActionId, setSectionActionId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [orderedSections, setOrderedSections] = useState(data.sections);
  const sensors = useSensors(
    useSensor(MouseSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 180, tolerance: 5 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  async function addSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (data.events.length && !selectedEventIds.length) {
      setError("Pilih setidaknya satu kegiatan untuk bagian pelayanan ini.");
      return;
    }
    setSaving(true);
    setError("");
    const sortOrder =
      orderedSections.reduce(
        (highest, section) => Math.max(highest, section.sort_order),
        -1,
      ) + 1;
    try {
      await createServiceSection({
        organizationId: data.organization.id,
        name,
        sortOrder,
        eventGroupIds: selectedEventIds,
      });
      setName("");
      setSelectedEventIds([]);
      await onChanged("Bagian pelayanan berhasil ditambahkan.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Bagian tidak dapat disimpan.",
      );
    } finally {
      setSaving(false);
    }
  }

  function startEdit(section: ServiceSection) {
    setEditingSectionId(section.id);
    setEditName(section.name);
    setEditEventIds(
      data.requirements
        .filter((requirement) => requirement.section_id === section.id)
        .map((requirement) => requirement.event_group_id),
    );
    setError("");
  }

  function cancelEdit() {
    setEditingSectionId(null);
    setEditName("");
    setEditEventIds([]);
  }

  async function saveSection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingSectionId) return;
    if (data.events.length && !editEventIds.length) {
      setError("Pilih setidaknya satu kegiatan untuk bagian pelayanan ini.");
      return;
    }
    setSectionActionId(editingSectionId);
    setError("");
    try {
      await updateServiceSection({
        id: editingSectionId,
        organizationId: data.organization.id,
        name: editName,
        eventGroupIds: editEventIds,
      });
      cancelEdit();
      await onChanged("Bagian pelayanan berhasil diperbarui.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Bagian pelayanan tidak dapat diperbarui.",
      );
    } finally {
      setSectionActionId(null);
    }
  }

  async function removeSection(section: ServiceSection) {
    const requirementCount = data.requirements.filter(
      (requirement) => requirement.section_id === section.id,
    ).length;
    const assignmentCount = data.assignments.filter(
      (assignment) => assignment.section_id === section.id,
    ).length;
    const eligibilityCount = data.eligibilities.filter(
      (eligibility) => eligibility.section_id === section.id,
    ).length;
    const confirmed = window.confirm(
      `Hapus ${section.name} secara permanen?\n\n${requirementCount} kegiatan, ${assignmentCount} penugasan, dan ${eligibilityCount} kualifikasi pelayan yang terkait juga akan dihapus. Tindakan ini tidak dapat dibatalkan.`,
    );
    if (!confirmed) return;

    setSectionActionId(section.id);
    setError("");
    try {
      await deleteServiceSection({
        id: section.id,
        organizationId: data.organization.id,
      });
      if (editingSectionId === section.id) cancelEdit();
      await onChanged("Bagian pelayanan berhasil dihapus.");
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Bagian pelayanan tidak dapat dihapus.",
      );
    } finally {
      setSectionActionId(null);
    }
  }

  function toggleEvent(
    eventGroupId: string,
    selectedIds: string[],
    setSelectedIds: (ids: string[]) => void,
  ) {
    setSelectedIds(
      selectedIds.includes(eventGroupId)
        ? selectedIds.filter((id) => id !== eventGroupId)
        : [...selectedIds, eventGroupId],
    );
  }

  async function finishReorder(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id) return;
    const previousIndex = orderedSections.findIndex(
      (section) => section.id === event.active.id,
    );
    const nextIndex = orderedSections.findIndex(
      (section) => section.id === event.over?.id,
    );
    if (previousIndex < 0 || nextIndex < 0) return;

    const previousOrder = orderedSections;
    const nextOrder = arrayMove(previousOrder, previousIndex, nextIndex);
    setOrderedSections(nextOrder);
    setReordering(true);
    setError("");
    try {
      await reorderServiceSections({
        organizationId: data.organization.id,
        sectionIds: nextOrder.map((section) => section.id),
      });
      await onChanged("Urutan bagian pelayanan berhasil diperbarui.");
    } catch (cause) {
      setOrderedSections(previousOrder);
      setError(
        cause instanceof Error ? cause.message : "Urutan tidak dapat disimpan.",
      );
    } finally {
      setReordering(false);
    }
  }

  return (
    <>
      <PageHeader
        title="Pengaturan"
        description="Atur struktur pelayanan dan bahasa aplikasi."
      />
      <section className="settings-grid">
        <article className="card settings-card section-settings">
          <div>
            <span className="settings-icon">
              <Users size={20} />
            </span>
            <div>
              <h2>Bagian pelayanan</h2>
              <p>
                Bagian ini digunakan untuk kualifikasi dan kebutuhan jadwal.
              </p>
            </div>
          </div>
          <form className="section-form py-2" onSubmit={addSection}>
            <div className="service-section-fields">
              <label>
                Nama bagian pelayanan
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="contoh: Worship Leader"
                  required
                />
              </label>
              <EventSelector
                events={data.events}
                selectedIds={selectedEventIds}
                onToggle={(eventGroupId) =>
                  toggleEvent(
                    eventGroupId,
                    selectedEventIds,
                    setSelectedEventIds,
                  )
                }
              />
            </div>
            <button
              className="button button-primary"
              type="submit"
              disabled={saving || reordering || Boolean(sectionActionId)}
            >
              {saving ? <LoaderCircle className="spin" size={17} /> : <Plus size={17} />}
              {saving ? "Menyimpan..." : "Tambah"}
            </button>
          </form>
          {error ? (
            <p className="form-error" role="alert">
              {error}
            </p>
          ) : null}
          {orderedSections.length ? (
            <div className="service-section-order">
              <div className="service-section-order-heading">
                <div>
                  <strong>Urutan tampilan</strong>
                  <small>
                    Seret jenis pelayanan untuk menentukan urutannya pada
                    jadwal.
                  </small>
                </div>
                {reordering ? (
                  <span>
                    <LoaderCircle className="spin" size={15} /> Menyimpan...
                  </span>
                ) : null}
              </div>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={finishReorder}
              >
                <SortableContext
                  items={orderedSections.map((section) => section.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ol className="service-section-list">
                    {orderedSections.map((section, index) => (
                      <SortableServiceSection
                        key={section.id}
                        section={section}
                        position={index + 1}
                        eventNames={data.requirements
                          .filter(
                            (requirement) =>
                              requirement.section_id === section.id,
                          )
                          .map(
                            (requirement) =>
                              data.events.find(
                                (event) =>
                                  event.id === requirement.event_group_id,
                              )?.name,
                          )
                          .filter((eventName): eventName is string => Boolean(eventName))}
                        disabled={
                          reordering ||
                          Boolean(sectionActionId) ||
                          Boolean(editingSectionId)
                        }
                        onEdit={() => startEdit(section)}
                        onDelete={() => removeSection(section)}
                      >
                        {editingSectionId === section.id ? (
                          <form className="service-section-editor" onSubmit={saveSection}>
                            <label>
                              Nama bagian pelayanan
                              <input
                                value={editName}
                                onChange={(event) => setEditName(event.target.value)}
                                required
                                autoFocus
                              />
                            </label>
                            <EventSelector
                              events={data.events}
                              selectedIds={editEventIds}
                              onToggle={(eventGroupId) =>
                                toggleEvent(
                                  eventGroupId,
                                  editEventIds,
                                  setEditEventIds,
                                )
                              }
                            />
                            <div className="service-section-editor-actions">
                              <button
                                className="button button-secondary"
                                type="button"
                                onClick={cancelEdit}
                                disabled={sectionActionId === section.id}
                              >
                                <X size={16} /> Batal
                              </button>
                              <button
                                className="button button-primary"
                                type="submit"
                                disabled={sectionActionId === section.id}
                              >
                                {sectionActionId === section.id ? (
                                  <LoaderCircle className="spin" size={16} />
                                ) : (
                                  <Check size={16} />
                                )}
                                {sectionActionId === section.id
                                  ? "Menyimpan..."
                                  : "Simpan"}
                              </button>
                            </div>
                          </form>
                        ) : null}
                      </SortableServiceSection>
                    ))}
                  </ol>
                </SortableContext>
              </DndContext>
            </div>
          ) : (
            <small>Belum ada bagian pelayanan.</small>
          )}
        </article>
        <article className="card settings-card">
          <div>
            <span className="settings-icon">
              <MessageCircle size={20} />
            </span>
            <div>
              <h2>Bahasa aplikasi</h2>
              <p>Bahasa untuk koordinator dan portal pelayan.</p>
            </div>
          </div>
          <div className="language-options">
            <button className="selected" type="button">
              <span>ID</span>
              <strong>Bahasa Indonesia</strong>
              <Check size={17} />
            </button>
            <button type="button" disabled>
              <span>EN</span>
              <strong>English</strong>
              <small>Segera</small>
            </button>
            <button type="button" disabled>
              <span>繁</span>
              <strong>繁體中文</strong>
              <small>Segera</small>
            </button>
          </div>
        </article>
      </section>
    </>
  );
}

function SortableServiceSection({
  section,
  position,
  eventNames,
  disabled,
  onEdit,
  onDelete,
  children,
}: {
  section: ServiceSection;
  position: number;
  eventNames: string[];
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
  children?: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id, disabled });

  return (
    <li
      ref={setNodeRef}
      className={
        isDragging ? "service-section-item is-dragging" : "service-section-item"
      }
      style={{ transform: CSS.Transform.toString(transform), transition }}
    >
      <button
        className="drag-handle"
        type="button"
        aria-label={`Ubah urutan ${section.name}`}
        title="Seret atau gunakan tombol panah untuk mengubah urutan"
        disabled={disabled}
        {...attributes}
        {...listeners}
      >
        <GripVertical size={19} />
      </button>
      <span className="service-section-position">{position}</span>
      <div className="service-section-summary">
        <strong>{section.name}</strong>
        <small>
          {eventNames.length ? eventNames.join(", ") : "Belum digunakan pada kegiatan"}
        </small>
      </div>
      <div className="service-section-actions">
        <button
          className="icon-button"
          type="button"
          onClick={onEdit}
          aria-label={`Edit ${section.name}`}
          disabled={disabled}
        >
          <Pencil size={16} />
        </button>
        <button
          className="icon-button danger"
          type="button"
          onClick={onDelete}
          aria-label={`Hapus ${section.name}`}
          disabled={disabled}
        >
          <Trash2 size={16} />
        </button>
      </div>
      {children}
    </li>
  );
}

function EventSelector({
  events,
  selectedIds,
  onToggle,
}: {
  events: PlannerData["events"];
  selectedIds: string[];
  onToggle: (eventGroupId: string) => void;
}) {
  return (
    <fieldset className="service-event-selector">
      <legend>Kegiatan yang menggunakan bagian ini</legend>
      {events.length ? (
        <div>
          {events.map((event) => (
            <label key={event.id}>
              <input
                type="checkbox"
                checked={selectedIds.includes(event.id)}
                onChange={() => onToggle(event.id)}
              />
              <span>{event.name}</span>
            </label>
          ))}
        </div>
      ) : (
        <small>Belum ada kegiatan. Bagian dapat dihubungkan setelah kegiatan dibuat.</small>
      )}
    </fieldset>
  );
}
