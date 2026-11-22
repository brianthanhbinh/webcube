unit DOM;

{$mode objfpc}{$H+}

interface

uses JS, Web, SysUtils;

type
  TDomNode = class;
  TDomElement = class;

  TDomNodeList = class external name 'NodeList' (TJSObject)
  private
    FLength: NativeInt; external name 'length';
  public
    function item(Index: NativeInt): TDomNode;
    property Count: NativeInt read FLength;
    property Items[Index: NativeInt]: TDomNode read item; default;
  end;

  TDomAttr = class external name 'Attr' (TJSNode)
  end;

  TDomNamedNodeMap = class external name 'NamedNodeMap' (TJSObject)
  private
    FLength: NativeInt; external name 'length';
  public
    function item(Index: NativeInt): TDomAttr;
    property Length: NativeInt read FLength;
    property Items[Index: NativeInt]: TDomAttr read item; default;
  end;

  TDomNode = class external name 'Node' (TJSNode)
  private
    FAttributes: TDomNamedNodeMap; external name 'attributes';
    FChildNodes: TDomNodeList; external name 'childNodes';
    FParentNode: TDomNode; external name 'parentNode';
    FNodeName: String; external name 'nodeName';
  public
    function FindNode(const AName: String): TDomNode;
    function CompareName(const AName: String): Integer;
    property Attributes: TDomNamedNodeMap read FAttributes;
    property ChildNodes: TDomNodeList read FChildNodes;
    property ParentNode: TDomNode read FParentNode;
    property NodeName: String read FNodeName;
  end;

  TDomElement = class external name 'Element' (TDomNode)
  private
    function GetAttribute(const AName: String): String; external name 'getAttribute';
    procedure SetAttribute(const AName, AValue: String); external name 'setAttribute';
  public
    property AttribStrings[const AName: String]: String
      read GetAttribute write SetAttribute; default;
  end;

  TXMLDocument = class external name 'Document' (TJSObject)
  private
    FDocumentElement: TDomElement; external name 'documentElement';
  public
    function CreateElement(const AName: String): TDomElement; external name 'createElement';
    function AppendChild(Node: TDomNode): TDomNode; external name 'appendChild';
    procedure Free;
    property DocumentElement: TDomElement read FDocumentElement;
  end;

  TXmlDocument = TXMLDocument;

implementation

function TDomNodeList.item(Index: NativeInt): TDomNode;
begin
  Result := TDomNode(TJSNodeList(Self).item(Index));
end;

function TDomNamedNodeMap.item(Index: NativeInt): TDomAttr;
begin
  Result := TDomAttr(TJSNamedNodeMap(Self).getNamedItem(''));
end;

function TDomNode.FindNode(const AName: String): TDomNode;
var
  I: Integer;
  Child: TDomNode;
begin
  Result := nil;
  for I := 0 to ChildNodes.Count - 1 do begin
    Child := ChildNodes[I];
    if SameText(Child.NodeName, AName) then
      Exit(Child);
  end;
end;

function TDomNode.CompareName(const AName: String): Integer;
begin
  if SameText(NodeName, AName) then Result := 0 else Result := 1;
end;

procedure TXMLDocument.Free;
begin
  { Browser-owned XML documents are garbage-collected by JavaScript. }
end;

end.
