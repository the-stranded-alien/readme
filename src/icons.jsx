// App icons: IconPark (Apache-2.0), exported under the names the app already uses.
// Large icons (16 px and up) are multi-colour; smaller ones are two-tone or filled
// depending on the theme. Colours are placeholders that index.css maps to theme
// tokens, so every theme and high-contrast mode can restyle them.
import { createContext, createElement, useContext } from 'react'
import '@icon-park/react/styles/index.css'
import {
  Aiming as ParkAiming,
  AlignTextLeft as ParkAlignTextLeft,
  ArrowRight as ParkArrowRight,
  ArrowUp as ParkArrowUp,
  Asterisk as ParkAsterisk,
  BookOne as ParkBookOne,
  BookOpen as ParkBookOpen,
  Bookmark as ParkBookmark,
  BookmarkOne as ParkBookmarkOne,
  Calendar as ParkCalendar,
  Cat as ParkCat,
  Caution as ParkCaution,
  Check as ParkCheck,
  CheckCorrect as ParkCheckCorrect,
  Close as ParkClose,
  CloseOne as ParkCloseOne,
  Code as ParkCode,
  CodeBrackets as ParkCodeBrackets,
  CodeOne as ParkCodeOne,
  Command as ParkCommand,
  Comment as ParkComment,
  Contrast as ParkContrast,
  Copy as ParkCopy,
  CopyOne as ParkCopyOne,
  DatabaseSync as ParkDatabaseSync,
  Delete as ParkDelete,
  DocDetail as ParkDocDetail,
  Down as ParkDown,
  Download as ParkDownload,
  DownloadOne as ParkDownloadOne,
  Earth as ParkEarth,
  Edit as ParkEdit,
  Error as ParkError,
  Exchange as ParkExchange,
  ExpandLeftAndRight as ParkExpandLeftAndRight,
  FileAddition as ParkFileAddition,
  FileCode as ParkFileCode,
  FileFailed as ParkFileFailed,
  FileSearch as ParkFileSearch,
  FileZip as ParkFileZip,
  Filter as ParkFilter,
  FoldUpOne as ParkFoldUpOne,
  ExpandLeft as ParkExpandLeft,
  ContrastView as ParkContrastView,
  DownloadComputer as ParkDownloadComputer,
  CheckOne as ParkCheckOne,
  Bookshelf as ParkBookshelf,
  GridFour as ParkGridFour,
  ErrorPicture as ParkErrorPicture,
  Undo as ParkUndo,
  Redo as ParkRedo,
  Display as ParkDisplay,
  Transfer as ParkTransfer,
  ImageFiles as ParkImageFiles,
  RotateOne as ParkRotateOne,
  Compression as ParkCompression,
  More as ParkMore,
  IndentLeft as ParkIndentLeft,
  IndentRight as ParkIndentRight,
  Send as ParkSend,
  AlignTextCenter as ParkAlignTextCenter,
  AlignTextRight as ParkAlignTextRight,
  ArrowDown as ParkArrowDown,
  ArrowLeft as ParkArrowLeft,
  Column as ParkColumn,
  InsertTable as ParkInsertTable,
  SortAmountUp as ParkSortAmountUp,
  SortAmountDown as ParkSortAmountDown,
  Clear as ParkClear,
  TargetOne as ParkTargetOne,
  HourglassFull as ParkHourglassFull,
  ExpandRight as ParkExpandRight,
  FolderClose as ParkFolderClose,
  FolderConversion as ParkFolderConversion,
  FolderOpen as ParkFolderOpen,
  FolderPlus as ParkFolderPlus,
  FontSize as ParkFontSize,
  Foot as ParkFoot,
  FullScreen as ParkFullScreen,
  Fullwidth as ParkFullwidth,
  H1 as ParkH1,
  H2 as ParkH2,
  H3 as ParkH3,
  HardDisk as ParkHardDisk,
  Help as ParkHelp,
  HighLight as ParkHighLight,
  History as ParkHistory,
  InboxOut as ParkInboxOut,
  Info as ParkInfo,
  Keyboard as ParkKeyboard,
  LayoutTwo as ParkLayoutTwo,
  Leaf as ParkLeaf,
  Left as ParkLeft,
  Lightning as ParkLightning,
  Link as ParkLink,
  LinkOut as ParkLinkOut,
  LinkTwo as ParkLinkTwo,
  ListCheckbox as ParkListCheckbox,
  ListTwo as ParkListTwo,
  Loading as ParkLoading,
  Lock as ParkLock,
  Magic as ParkMagic,
  MagicWand as ParkMagicWand,
  MenuFold as ParkMenuFold,
  MenuUnfold as ParkMenuUnfold,
  MessageFailed as ParkMessageFailed,
  Minus as ParkMinus,
  Moon as ParkMoon,
  NetworkTree as ParkNetworkTree,
  Notes as ParkNotes,
  OffScreen as ParkOffScreen,
  OrderedList as ParkOrderedList,
  PageTemplate as ParkPageTemplate,
  Pause as ParkPause,
  Pic as ParkPic,
  Pin as ParkPin,
  Platte as ParkPlatte,
  Play as ParkPlay,
  Plus as ParkPlus,
  Pound as ParkPound,
  PreviewOpen as ParkPreviewOpen,
  Protect as ParkProtect,
  Pushpin as ParkPushpin,
  Quote as ParkQuote,
  Refresh as ParkRefresh,
  Right as ParkRight,
  Save as ParkSave,
  Search as ParkSearch,
  Setting as ParkSetting,
  SettingConfig as ParkSettingConfig,
  Share as ParkShare,
  Shield as ParkShield,
  Snowflake as ParkSnowflake,
  Star as ParkStar,
  Strikethrough as ParkStrikethrough,
  Sum as ParkSum,
  Sun as ParkSun,
  SunOne as ParkSunOne,
  Sunrise as ParkSunrise,
  Switch as ParkSwitch,
  SwitchOne as ParkSwitchOne,
  Table as ParkTable,
  Tag as ParkTag,
  Text as ParkText,
  TextBold as ParkTextBold,
  TextItalic as ParkTextItalic,
  TextStyle as ParkTextStyle,
  TextWrapOverflow as ParkTextWrapOverflow,
  Time as ParkTime,
  Tips as ParkTips,
  Translate as ParkTranslate,
  TreeDiagram as ParkTreeDiagram,
  TreeList as ParkTreeList,
  Up as ParkUp,
  UpAndDown as ParkUpAndDown,
  Upload as ParkUpload,
  VolumeNotice as ParkVolumeNotice,
  Waves as ParkWaves,
  Write as ParkWrite,
  ZoomIn as ParkZoomIn,
  ZoomOut as ParkZoomOut,
  Notepad as ParkNotepad,
  Slide as ParkSlide,
  Adjustment as ParkAdjustment,
  Cup as ParkCup,
  TeaDrink as ParkTeaDrink,
} from '@icon-park/react'

/** 'two-tone' or 'filled' — the style for small icons, chosen by the theme. */
export const IconStyleContext = createContext('two-tone')

// [outer stroke, outer fill, inner stroke, inner fill] — replaced by CSS (see .ip in index.css).
const SLOTS = ['#0a0b01', '#0a0b02', '#0a0b03', '#0a0b04']
export const LARGE_ICON = 16

function make(ParkIcon, name) {
  function Icon({ size = 24, strokeWidth, fill, variant, className, style, color, 'aria-hidden': ariaHidden, ...rest }) {
    const smallStyle = useContext(IconStyleContext)
    const px = Number(size) || 24
    let theme = variant ?? (px >= LARGE_ICON ? 'multi-color' : smallStyle)
    // Lucide-style `fill="currentColor"` meant "solid": keep that meaning.
    if (fill && fill !== 'none') theme = 'filled'
    return createElement(ParkIcon, {
      ...rest,
      theme,
      size: px,
      fill: SLOTS,
      strokeWidth: strokeWidth ? Number(strokeWidth) * 2 : 4,
      className: `ip ip-${theme}${className ? ` ${className}` : ''}`,
      style: color ? { ...style, color } : style,
      'aria-hidden': ariaHidden ?? true,
    })
  }
  Icon.displayName = name
  return Icon
}

export const AlertTriangle = make(ParkCaution, 'AlertTriangle')
export const AlignLeft = make(ParkAlignTextLeft, 'AlignLeft')
export const ArchiveRestore = make(ParkInboxOut, 'ArchiveRestore')
export const ArrowLeftRight = make(ParkExchange, 'ArrowLeftRight')
export const ArrowRight = make(ParkArrowRight, 'ArrowRight')
export const ArrowUp = make(ParkArrowUp, 'ArrowUp')
export const Bold = make(ParkTextBold, 'Bold')
export const BookOpen = make(ParkBookOpen, 'BookOpen')
export const BookOpenText = make(ParkBookOne, 'BookOpenText')
export const BookmarkCheck = make(ParkBookmarkOne, 'BookmarkCheck')
export const BookmarkPlus = make(ParkBookmark, 'BookmarkPlus')
export const CalendarDays = make(ParkCalendar, 'CalendarDays')
export const CaseSensitive = make(ParkFontSize, 'CaseSensitive')
export const Cat = make(ParkCat, 'Cat')
export const Check = make(ParkCheck, 'Check')
export const ChevronDown = make(ParkDown, 'ChevronDown')
export const ChevronLeft = make(ParkLeft, 'ChevronLeft')
export const ChevronRight = make(ParkRight, 'ChevronRight')
export const ChevronUp = make(ParkUp, 'ChevronUp')
export const ChevronsDownUp = make(ParkFoldUpOne, 'ChevronsDownUp')
export const PanelWiden = make(ParkExpandRight, 'PanelWiden')
export const MoreHorizontal = make(ParkMore, 'MoreHorizontal')
export const Outdent = make(ParkIndentLeft, 'Outdent')
export const Indent = make(ParkIndentRight, 'Indent')
export const SendTo = make(ParkSend, 'SendTo')
export const AlignCenter = make(ParkAlignTextCenter, 'AlignCenter')
export const AlignRight = make(ParkAlignTextRight, 'AlignRight')
export const ArrowDown = make(ParkArrowDown, 'ArrowDown')
export const ArrowLeft = make(ParkArrowLeft, 'ArrowLeft')
export const Columns = make(ParkColumn, 'Columns')
export const Rows = make(ParkInsertTable, 'Rows')
export const SortAsc = make(ParkSortAmountUp, 'SortAsc')
export const SortDesc = make(ParkSortAmountDown, 'SortDesc')
export const PanelNarrow = make(ParkExpandLeft, 'PanelNarrow')
export const Eraser = make(ParkClear, 'Eraser')
export const LaserPointer = make(ParkTargetOne, 'LaserPointer')
export const Hourglass = make(ParkHourglassFull, 'Hourglass')
export const ChevronsUpDown = make(ParkUpAndDown, 'ChevronsUpDown')
export const CircleHelp = make(ParkHelp, 'CircleHelp')
export const Clock = make(ParkTime, 'Clock')
export const Code = make(ParkCode, 'Code')
export const Code2 = make(ParkCodeBrackets, 'Code2')
export const Command = make(ParkCommand, 'Command')
export const Contrast = make(ParkContrast, 'Contrast')
export const Copy = make(ParkCopy, 'Copy')
export const CopyPlus = make(ParkCopyOne, 'CopyPlus')
export const Crosshair = make(ParkAiming, 'Crosshair')
export const DatabaseBackup = make(ParkDatabaseSync, 'DatabaseBackup')
export const Download = make(ParkDownload, 'Download')
export const ExternalLink = make(ParkLinkOut, 'ExternalLink')
export const Eye = make(ParkPreviewOpen, 'Eye')
export const Feather = make(ParkWrite, 'Feather')
export const FileArchive = make(ParkFileZip, 'FileArchive')
export const FileCode2 = make(ParkFileCode, 'FileCode2')
export const FileDown = make(ParkDownloadOne, 'FileDown')
export const FilePlus = make(ParkFileAddition, 'FilePlus')
export const FileText = make(ParkDocDetail, 'FileText')
export const FileWarning = make(ParkFileFailed, 'FileWarning')
export const Filter = make(ParkFilter, 'Filter')
export const FoldHorizontal = make(ParkOffScreen, 'FoldHorizontal')
export const Folder = make(ParkFolderClose, 'Folder')
export const FolderOpen = make(ParkFolderOpen, 'FolderOpen')
export const FolderPlus = make(ParkFolderPlus, 'FolderPlus')
export const FolderSync = make(ParkFolderConversion, 'FolderSync')
export const FolderTree = make(ParkTreeList, 'FolderTree')
export const Footprints = make(ParkFoot, 'Footprints')
// Two panes side by side: comparing files / versions.
export const GitCompare = make(ParkContrastView, 'GitCompare')
export const Globe = make(ParkEarth, 'Globe')
export const HardDrive = make(ParkHardDisk, 'HardDrive')
export const Hash = make(ParkPound, 'Hash')
export const Heading1 = make(ParkH1, 'Heading1')
export const Heading2 = make(ParkH2, 'Heading2')
export const Heading3 = make(ParkH3, 'Heading3')
export const Highlighter = make(ParkHighLight, 'Highlighter')
export const History = make(ParkHistory, 'History')
export const Image = make(ParkPic, 'Image')
export const Info = make(ParkInfo, 'Info')
export const Italic = make(ParkTextItalic, 'Italic')
export const Keyboard = make(ParkKeyboard, 'Keyboard')
export const Languages = make(ParkTranslate, 'Languages')
export const LayoutTemplate = make(ParkPageTemplate, 'LayoutTemplate')
export const Leaf = make(ParkLeaf, 'Leaf')
export const Lightbulb = make(ParkTips, 'Lightbulb')
export const Link = make(ParkLink, 'Link')
export const Link2 = make(ParkLinkTwo, 'Link2')
export const List = make(ParkListTwo, 'List')
export const ListChecks = make(ParkListCheckbox, 'ListChecks')
export const ListOrdered = make(ParkOrderedList, 'ListOrdered')
export const ListTree = make(ParkTreeDiagram, 'ListTree')
export const Loader2 = make(ParkLoading, 'Loader2')
export const Lock = make(ParkLock, 'Lock')
export const Maximize2 = make(ParkFullScreen, 'Maximize2')
export const MessageSquareQuote = make(ParkComment, 'MessageSquareQuote')
export const MessageSquareWarning = make(ParkMessageFailed, 'MessageSquareWarning')
export const Minimize2 = make(ParkOffScreen, 'Minimize2')
export const Minus = make(ParkMinus, 'Minus')
export const MonitorDown = make(ParkCup, 'MonitorDown')
export const AppDownload = make(ParkDownloadComputer, 'AppDownload')
export const CircleCheck = make(ParkCheckOne, 'CircleCheck')
export const Library = make(ParkBookshelf, 'Library')
export const LayoutGrid = make(ParkGridFour, 'LayoutGrid')
export const ImageOff = make(ParkErrorPicture, 'ImageOff')
export const Undo2 = make(ParkUndo, 'Undo2')
export const Display = make(ParkDisplay, 'Display')
export const Redo2 = make(ParkRedo, 'Redo2')
export const Transpose = make(ParkTransfer, 'Transpose')
export const Images = make(ParkImageFiles, 'Images')
export const RotateCw = make(ParkRotateOne, 'RotateCw')
export const Shrink = make(ParkCompression, 'Shrink')
export const MonitorUp = make(ParkTeaDrink, 'MonitorUp')
export const Moon = make(ParkMoon, 'Moon')
export const OctagonAlert = make(ParkError, 'OctagonAlert')
export const Palette = make(ParkPlatte, 'Palette')
export const PanelBottom = make(ParkLayoutTwo, 'PanelBottom')
export const PanelLeftClose = make(ParkMenuFold, 'PanelLeftClose')
export const PanelLeftOpen = make(ParkMenuUnfold, 'PanelLeftOpen')
export const Pause = make(ParkPause, 'Pause')
export const Pencil = make(ParkEdit, 'Pencil')
export const Pin = make(ParkPin, 'Pin')
export const PinOff = make(ParkPushpin, 'PinOff')
export const Play = make(ParkPlay, 'Play')
export const Plus = make(ParkPlus, 'Plus')
export const Presentation = make(ParkSlide, 'Presentation')
export const Quote = make(ParkQuote, 'Quote')
export const RefreshCw = make(ParkRefresh, 'RefreshCw')
export const Regex = make(ParkAsterisk, 'Regex')
export const Replace = make(ParkSwitch, 'Replace')
export const ReplaceAll = make(ParkSwitchOne, 'ReplaceAll')
export const RotateCcw = make(ParkUndo, 'RotateCcw')
export const Save = make(ParkSave, 'Save')
export const ScrollText = make(ParkNotepad, 'ScrollText')
export const Search = make(ParkSearch, 'Search')
export const SearchCode = make(ParkFileSearch, 'SearchCode')
export const Settings = make(ParkSetting, 'Settings')
export const Settings2 = make(ParkSettingConfig, 'Settings2')
export const Share2 = make(ParkShare, 'Share2')
export const ShieldAlert = make(ParkShield, 'ShieldAlert')
export const ShieldCheck = make(ParkProtect, 'ShieldCheck')
export const Sigma = make(ParkSum, 'Sigma')
export const Snowflake = make(ParkSnowflake, 'Snowflake')
export const Sparkles = make(ParkMagic, 'Sparkles')
export const SpellCheck = make(ParkCheckCorrect, 'SpellCheck')
export const SquareCode = make(ParkCodeOne, 'SquareCode')
export const Star = make(ParkStar, 'Star')
export const StickyNote = make(ParkNotes, 'StickyNote')
export const Strikethrough = make(ParkStrikethrough, 'Strikethrough')
export const Sun = make(ParkSun, 'Sun')
export const SunDim = make(ParkSunOne, 'SunDim')
export const Sunrise = make(ParkSunrise, 'Sunrise')
export const Superscript = make(ParkTextStyle, 'Superscript')
export const Table = make(ParkTable, 'Table')
export const Tag = make(ParkTag, 'Tag')
export const Trash2 = make(ParkDelete, 'Trash2')
export const TriangleAlert = make(ParkCaution, 'TriangleAlert')
export const Type = make(ParkText, 'Type')
export const UnfoldHorizontal = make(ParkExpandLeftAndRight, 'UnfoldHorizontal')
export const Upload = make(ParkUpload, 'Upload')
export const Volume2 = make(ParkVolumeNotice, 'Volume2')
export const Wand2 = make(ParkMagicWand, 'Wand2')
export const Waves = make(ParkWaves, 'Waves')
export const WholeWord = make(ParkFullwidth, 'WholeWord')
export const Workflow = make(ParkNetworkTree, 'Workflow')
export const WrapText = make(ParkTextWrapOverflow, 'WrapText')
export const X = make(ParkClose, 'X')
export const XCircle = make(ParkCloseOne, 'XCircle')
export const Zap = make(ParkLightning, 'Zap')
export const ZoomIn = make(ParkZoomIn, 'ZoomIn')
export const ZoomOut = make(ParkZoomOut, 'ZoomOut')
export const SlidersHorizontal = make(ParkAdjustment, 'SlidersHorizontal')
