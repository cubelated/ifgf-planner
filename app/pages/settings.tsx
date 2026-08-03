import {
  createServiceSection,
  PlannerData,
  reorderServiceSections,
  ServiceSection,
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
import { Check, GripVertical, LoaderCircle, MessageCircle, Plus, Users } from "lucide-react";
import { FormEvent, useState } from "react";
import { PageHeader } from "../planner-app";

export default function SettingsView({
  data,
  onChanged,
}: {
  data: PlannerData;
  onChanged: (message: string) => Promise<void>;
}) {
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [reordering, setReordering] = useState(false);
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
      });
      setName("");
      await onChanged("Bagian pelayanan berhasil ditambahkan.");
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Bagian tidak dapat disimpan.",
      );
    } finally {
      setSaving(false);
    }
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
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="ex. Worship Leader"
              required
            />
            <button
              className="button button-primary"
              type="submit"
              disabled={saving || reordering}
            >
              <Plus size={17} /> Tambah
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
                        disabled={reordering}
                      />
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
  disabled,
}: {
  section: ServiceSection;
  position: number;
  disabled: boolean;
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
      <strong>{section.name}</strong>
    </li>
  );
}
