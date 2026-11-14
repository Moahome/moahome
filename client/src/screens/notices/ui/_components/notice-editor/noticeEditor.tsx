'use client';

import {
  useEffect,
  useRef,
  useState
} from 'react';
import {
  EditorContent,
  useEditor
} from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import {
  TextStyle,
  FontSize,
  Color
} from '@tiptap/extension-text-style';
import TextAlign from '@tiptap/extension-text-align';
import { Button } from '@/shared/ui/button';
import { Dropdown } from '@/shared/ui/form-controls';
import {
  ServiceIcon,
  type ServiceIconName
} from '@/shared/ui/service-icon';
import { Toast } from '@/shared/ui/toast';
import {
  readNoticeAsset,
  uploadNoticeAsset
} from '../../../api/noticeApi';
import styles from './noticeEditor.module.css';

const EMPTY = {
  type: 'doc',
  content: [{
    type: 'paragraph'
  }]
};

const FORMAT_GROUPS = ['글자 서식', '목록', '정렬'] as const;

type FormatTool = {
  group: typeof FORMAT_GROUPS[number];
  label: string;
  icon: ServiceIconName;
  active: boolean;
  run: () => boolean;
};

/** 문서에는 영구 API 참조만 남기고 화면의 이미지에만 인증해서 읽은 임시 Blob URL을 사용합니다. */
const PrivateImage = Image.extend({
  renderHTML({ HTMLAttributes }) {
    // 초기 HTML 생성 중에도 인증 없는 img 요청이 발생하지 않게 API 참조를 src에 넣지 않습니다.
    return ['img', {
      ...HTMLAttributes,
      src: String(HTMLAttributes.src ?? '').startsWith('/api/') ? undefined : HTMLAttributes.src
    }];
  },
  addNodeView() {
    return ({ node }) => {
      const img = document.createElement('img');
      const controller = new AbortController();
      let objectUrl: string | null = null;
      img.alt = node.attrs.alt ?? '';
      img.draggable = true;
      const src = String(node.attrs.src ?? '');
      if (src.startsWith('data:image/')) img.src = src;
      else void readNoticeAsset(src, controller.signal).then((blob) => {
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob);
        img.src = objectUrl;
      }).catch(() => { if (!controller.signal.aborted) img.alt = '이미지를 불러오지 못했습니다.'; });
      return {
        dom: img,
        selectNode: () => img.classList.add('ProseMirror-selectednode'),
        deselectNode: () => img.classList.remove('ProseMirror-selectednode'),
        destroy: () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); }
      };
    };
  }
});

/** 같은 문서로 편집·상세 열람을 제공하고 선택한 이미지는 명시적으로 변경·삭제합니다. */
export function NoticeEditor({ propertyId, initialContent, onChange, onBusyChange, disabled = false, readOnly = false }: {
  propertyId: string;
  initialContent?: string;
  onChange?: (content: string) => void;
  onBusyChange?: (busy: boolean) => void;
  disabled?: boolean;
  readOnly?: boolean;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const colorInput = useRef<HTMLInputElement>(null);
  const replacement = useRef<number | null>(null);
  const readingLock = useRef(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState(false);
  const editor = useEditor({
    immediatelyRender: false,
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        link: {
          openOnClick: readOnly,
          protocols: ['http', 'https']
        }
      }),
      TextStyle,
      FontSize,
      Color,
      TextAlign.configure({
        types: ['heading', 'paragraph']
      }),
      PrivateImage.configure({
        allowBase64: true
      })
    ],
    content: initialContent ? JSON.parse(initialContent) : EMPTY,
    editable: !disabled && !readOnly,
    editorProps: {
      attributes: {
        'aria-label': readOnly ? '공지 본문' : '공지 내용 편집기',
        role: readOnly ? 'document' : 'textbox',
        'aria-multiline': 'true',
        'data-placeholder': '내용을 입력해 주세요...'
      }
    },
    onUpdate: ({ editor: current }) => onChange?.(JSON.stringify(current.getJSON()))
  });

  useEffect(() => {
    editor?.setEditable(!disabled && !readOnly && !reading);
  }, [editor, disabled, readOnly, reading]);

  const selectedColor = editor?.getAttributes('textStyle').color ?? '';

  // 예전 토큰 색상과 RGB 문자열도 현재 테마에서 해석해 네이티브 색상 선택기의 HEX 값으로 표시합니다.
  useEffect(() => {
    const input = colorInput.current;
    if (!input) return;
    const channels = getComputedStyle(input).color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
    if (channels?.length !== 3) return;
    input.value = `#${channels.map((value) => Math.round(value).toString(16).padStart(2, '0')).join('')}`;
  }, [selectedColor]);

  /** 파일을 고르기 전 이미지 위치를 기억해 교체 대상과 다른 이미지를 바꾸지 않습니다. */
  function chooseImage(replace = false) {
    if (!editor || disabled || reading) return;
    replacement.current = replace && editor.isActive('image') ? editor.state.selection.from : null;
    if (upload.current) { upload.current.multiple = !replace; upload.current.click(); }
  }

  /** 선택한 글자를 보존해 이미지를 삽입하고 읽는 동안 게시를 막습니다. */
  async function insertImages(selected: File[]) {
    if (!selected.length || !editor || disabled || readingLock.current) return;
    if (selected.some((file) => !['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024)) {
      setError('PNG·JPG·WebP 이미지를 20MB 이하로 선택해주세요.');
      return;
    }
    readingLock.current = true;
    setReading(true);
    onBusyChange?.(true);
    try {
      for (const file of selected) {
        const asset = await uploadNoticeAsset(propertyId, file, true);
        const source = asset.data;
        const attrs = {
          src: source,
          alt: file.name.replace(/\.[^.]+$/, '')
        };
        const position = replacement.current;
        if (position !== null && editor.state.doc.nodeAt(position)?.type.name === 'image') {
          editor.chain().focus().setNodeSelection(position).updateAttributes('image', attrs).run();
        } else {
          const from = editor.state.selection.to;
          editor.chain().focus().setTextSelection(from).setImage(attrs).run();
          // 새 이미지에 초점을 두어 삽입 직후에도 변경·삭제 버튼을 바로 제공합니다.
          let selected: number | null = null;
          editor.state.doc.descendants((node, pos) => {
            if (selected === null && node.type.name === 'image' && node.attrs.src === source && pos >= Math.max(0, from - 1)) selected = pos;
          });
          if (selected !== null) editor.commands.setNodeSelection(selected);
        }
        replacement.current = null;
      }
    } catch {
      setError('이미지를 저장하지 못했어요. 다시 선택해주세요.');
    } finally {
      replacement.current = null;
      readingLock.current = false;
      setReading(false);
      onBusyChange?.(false);
      if (upload.current) upload.current.value = '';
    }
  }

  /** 이미지 선택 상태에서만 해당 노드를 제거하며 앞뒤 본문은 유지합니다. */
  function removeImage() {
    if (!editor || disabled || reading || !editor.isActive('image')) return;
    editor.chain().focus().deleteSelection().run();
  }

  /** 선택 영역의 글자색만 바꾸고 기본색 복원 시 크기·굵기 등 다른 서식은 유지합니다. */
  function changeTextColor(color: string) {
    if (!editor || disabled || reading) return;
    if (color === 'default') {
      editor.chain().focus().unsetColor().run();
      return;
    }
    // 색상표에서 연속으로 값을 고를 수 있도록 네이티브 선택기의 포커스를 유지합니다.
    editor.chain().setColor(color).run();
  }

  const tools: FormatTool[] = editor ? [
    {
      group: '글자 서식',
      label: '굵게',
      icon: 'bold',
      active: editor.isActive('bold'),
      run: () => editor.chain().focus().toggleBold().run()
    },
    {
      group: '글자 서식',
      label: '기울임',
      icon: 'italic',
      active: editor.isActive('italic'),
      run: () => editor.chain().focus().toggleItalic().run()
    },
    {
      group: '글자 서식',
      label: '밑줄',
      icon: 'underline',
      active: editor.isActive('underline'),
      run: () => editor.chain().focus().toggleUnderline().run()
    },
    {
      group: '목록',
      label: '글머리 목록',
      icon: 'list-bullet',
      active: editor.isActive('bulletList'),
      run: () => editor.chain().focus().toggleBulletList().run()
    },
    {
      group: '목록',
      label: '번호 목록',
      icon: 'list-number',
      active: editor.isActive('orderedList'),
      run: () => editor.chain().focus().toggleOrderedList().run()
    },
    {
      group: '정렬',
      label: '왼쪽 정렬',
      icon: 'align-left',
      active: editor.isActive({
        textAlign: 'left'
      }),
      run: () => editor.chain().focus().setTextAlign('left').run()
    },
    {
      group: '정렬',
      label: '가운데 정렬',
      icon: 'align-center',
      active: editor.isActive({
        textAlign: 'center'
      }),
      run: () => editor.chain().focus().setTextAlign('center').run()
    },
    {
      group: '정렬',
      label: '오른쪽 정렬',
      icon: 'align-right',
      active: editor.isActive({
        textAlign: 'right'
      }),
      run: () => editor.chain().focus().setTextAlign('right').run()
    }
  ] : [];
  const level = [1, 2, 3].find((value) => editor?.isActive('heading', {
    level: value
  }));
  const imageSelected = Boolean(editor?.isActive('image'));

  return (
    <div
      className={styles.editor}
      data-read-only={readOnly}
      data-disabled={disabled}
      data-empty={editor?.isEmpty ?? true}
    >
      {!readOnly && (
        <>
          <div
            className={styles.toolbar}
            role={'group'}
            aria-label={'본문 서식'}
          >
            <div
              className={styles['toolbar-settings']}
              role={'group'}
              aria-label={'글자 스타일'}
            >
              <Dropdown
                fieldClassName={styles['paragraph-picker']}
                aria-label={'문단 스타일'}
                value={level ? `h${level}` : 'paragraph'}
                disabled={disabled || reading || !editor}
                options={[
                  {
                    value: 'paragraph',
                    label: '본문'
                  },
                  {
                    value: 'h1',
                    label: '제목1'
                  },
                  {
                    value: 'h2',
                    label: '제목2'
                  },
                  {
                    value: 'h3',
                    label: '제목3'
                  }
                ]}
                onChange={(value) => {
                  if (!editor) return;
                  if (value === 'paragraph') { editor.chain().focus().setParagraph().run(); return; }
                  const heading = Number(value.slice(1)) as 1 | 2 | 3;
                  editor.chain().focus().unsetFontSize().setHeading({
                    level: heading
                  }).run();
                }}
              />
              <Dropdown
                fieldClassName={styles['font-picker']}
                aria-label={'글자 크기'}
                value={editor?.getAttributes('textStyle').fontSize ?? '16px'}
                disabled={disabled || reading || !editor}
                options={[
                  {
                    value: '14px',
                    label: '14px'
                  }, {
                    value: '16px',
                    label: '16px'
                  }, {
                    value: '20px',
                    label: '20px'
                  }, {
                    value: '24px',
                    label: '24px'
                  }
                ]}
                onChange={(size) => editor?.chain().focus().setFontSize(size).run()}
              />
              <div
                className={styles['color-controls']}
                role={'group'}
                aria-label={'글자색'}
              >
                <label
                  className={styles['color-choice']}
                  title={'글자색 (RGB)'}
                >
                  <ServiceIcon
                    name={'palette'}
                    size={20}
                  />
                  <input
                    ref={colorInput}
                    type={'color'}
                    className={styles['color-input']}
                    aria-label={'글자 색상'}
                    style={{
                      color: selectedColor || 'var(--foreground)'
                    }}
                    disabled={disabled || reading || !editor}
                    onChange={(event) => changeTextColor(event.target.value)}
                  />
                  <ServiceIcon
                    name={'chevron'}
                    direction={'down'}
                    size={14}
                  />
                </label>
                {selectedColor && (
                  <Button
                    variant={'ghost'}
                    size={'sm'}
                    iconOnly
                    aria-label={'기본색'}
                    title={'기본색 복원'}
                    disabled={disabled || reading || !editor}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => changeTextColor('default')}
                  >
                    <ServiceIcon
                      name={'reset'}
                      size={18}
                    />
                  </Button>
                )}
              </div>
            </div>
            {FORMAT_GROUPS.map((group) => (
              <div
                key={group}
                className={styles['tool-group']}
                role={'group'}
                aria-label={group}
              >
                {tools.filter((tool) => tool.group === group).map((tool) => (
                  <Button
                    key={tool.label}
                    size={'sm'}
                    variant={'ghost'}
                    iconOnly
                    className={styles.tool}
                    aria-label={tool.label}
                    title={tool.label}
                    aria-pressed={tool.active}
                    disabled={disabled || reading}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={tool.run}
                  >
                    <ServiceIcon
                      name={tool.icon}
                      size={20}
                    />
                  </Button>
                ))}
              </div>
            ))}
            <div
              className={styles['tool-group']}
              role={'group'}
              aria-label={'이미지'}
            >
              <Button
                size={'sm'}
                variant={'ghost'}
                className={styles.tool}
                iconOnly
                aria-label={'이미지 삽입'}
                title={'이미지 삽입'}
                disabled={disabled || reading || !editor}
                onClick={() => chooseImage()}
              >
                <ServiceIcon
                  name={'image'}
                  size={21}
                />
              </Button>
            </div>
          </div>
          {imageSelected && (
            <div
              className={styles['image-actions']}
              role={'group'}
              aria-label={'선택한 이미지'}
            >
              <span>
                이미지 선택됨
              </span>
              <Button
                size={'sm'}
                variant={'outline'}
                disabled={disabled || reading}
                onClick={() => chooseImage(true)}
              >
                이미지 변경
              </Button>
              <Button
                size={'sm'}
                variant={'outline'}
                tone={'danger'}
                disabled={disabled || reading}
                leadingIcon={(
                  <ServiceIcon
                    name={'trash'}
                  />
                )}
                onClick={removeImage}
              >
                이미지 삭제
              </Button>
            </div>
          )}
          <input
            className={styles['file-input']}
            ref={upload}
            type={'file'}
            accept={'image/png,image/jpeg,image/webp'}
            multiple
            aria-label={'본문 이미지 선택'}
            onChange={(event) => void insertImages(Array.from(event.target.files ?? []))}
          />
        </>
      )}
      <div
        onPaste={(event) => {
          const files = Array.from(event.clipboardData.files).filter((entry) => entry.type.startsWith('image/'));
          if (!files.length || readOnly || disabled) return;
          event.preventDefault();
          replacement.current = null;
          void insertImages(files);
        }}
      >
        <EditorContent
          editor={editor}
          className={styles.content}
        />
      </div>
      {error && (
        <Toast
          message={error}
          tone={'error'}
          onClose={() => setError('')}
        />
      )}
    </div>
  );
}
